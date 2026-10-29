use crate::domain::{PasswordService, User};
use crate::jwt::JwtService;
use common::Email;
use proto::auth::auth_service_server::AuthService;
use proto::auth::{
    AuthResponse, GetUserProfileRequest, LoginRequest, RefreshTokenRequest, RegisterRequest,
    RevokeRefreshTokenRequest, RevokeRefreshTokenResponse, UpdateUserProfileRequest,
    UserProfileResponse, ValidateTokenRequest, ValidateTokenResponse,
};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

const REFRESH_TOKEN_TTL_DAYS: i32 = 30;

/// Two independent UUIDv4 values provide an opaque refresh token with 244 bits
/// of randomness. Only a SHA-256 digest is persisted.
fn generate_refresh_token() -> String {
    format!("{}{}", Uuid::new_v4().simple(), Uuid::new_v4().simple())
}

fn hash_refresh_token(token: &str) -> String {
    Sha256::digest(token.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub struct MyAuthService {
    pub pool: Arc<PgPool>,
}

impl MyAuthService {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

fn authenticated_user_id<T>(request: &Request<T>) -> Result<Uuid, Status> {
    let token = request
        .metadata()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| Status::unauthenticated("Token de usuario requerido"))?;

    let claims = JwtService::validate_token(token)
        .map_err(|_| Status::unauthenticated("Token de usuario inválido"))?;
    Uuid::parse_str(&claims.sub)
        .map_err(|_| Status::unauthenticated("Identidad de usuario inválida"))
}

fn enforce_user_scope(
    authenticated_user_id: Uuid,
    requested_user_id: &str,
) -> Result<Uuid, Status> {
    let requested_user_id = Uuid::parse_str(requested_user_id)
        .map_err(|_| Status::invalid_argument("user_id inválido"))?;
    if requested_user_id != authenticated_user_id {
        return Err(Status::permission_denied(
            "No puedes acceder a los datos de otro usuario",
        ));
    }
    Ok(requested_user_id)
}

#[tonic::async_trait]
impl AuthService for MyAuthService {
    async fn register(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let req = request.into_inner();

        let email =
            Email::parse(&req.email).map_err(|e| Status::invalid_argument(e.to_string()))?;

        // Mantener usuario y estadísticas en la misma transacción.
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar el registro"))?;

        let existing: Option<(uuid::Uuid,)> =
            sqlx::query_as("SELECT id FROM users WHERE email = $1")
                .bind(email.as_str())
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| Status::internal("No se pudo comprobar el correo"))?;

        if existing.is_some() {
            return Err(Status::already_exists(
                "El usuario ya existe con ese correo",
            ));
        }

        let password_hash = PasswordService::hash_password(&req.password)
            .map_err(|e| Status::internal(e.to_string()))?;

        let user = User::new(
            email.clone(),
            password_hash.clone(),
            req.full_name.clone(),
            req.target_role.clone(),
        );

        // Insertar en PostgreSQL
        sqlx::query(
            "INSERT INTO users (id, email, password_hash, full_name, target_role, current_level) VALUES ($1, $2, $3, $4, $5, $6)"
        )
        .bind(user.id)
        .bind(email.as_str())
        .bind(&password_hash)
        .bind(&user.full_name)
        .bind(&user.target_role)
        .bind(&user.current_level)
        .execute(&mut *tx)
        .await
        .map_err(|error| match &error {
            sqlx::Error::Database(database_error)
                if database_error.code().as_deref() == Some("23505") =>
            {
                Status::already_exists("El usuario ya existe con ese correo")
            }
            _ => {
                tracing::error!("Error de base de datos registrando usuario");
                Status::internal("No se pudo registrar el usuario")
            }
        })?;

        // Establecer la identidad en la misma transacción para que RLS permita
        // insertar las estadísticas propias sin abrir acceso a otras filas.
        common::set_current_user_id(&mut *tx, user.id)
            .await
            .map_err(|_| Status::internal("No se pudo establecer el contexto de usuario"))?;

        // Inicializar stats de gamificación
        sqlx::query(
            "INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered) VALUES ($1, 0, 0, 50, 0, 0) ON CONFLICT (user_id) DO NOTHING"
        )
        .bind(user.id)
        .execute(&mut *tx)
        .await
        .map_err(|_| {
            tracing::error!("Error inicializando estadísticas del nuevo usuario");
            Status::internal("No se pudo inicializar el perfil del usuario")
        })?;

        let access_token =
            JwtService::generate_token(user.id, email.as_str(), &user.target_role)
                .map_err(|_| Status::internal("No se pudo crear la sesión de usuario"))?;

        let refresh_token = generate_refresh_token();
        sqlx::query(
            "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3))"
        )
        .bind(user.id)
        .bind(hash_refresh_token(&refresh_token))
        .bind(REFRESH_TOKEN_TTL_DAYS)
        .execute(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo crear la sesión renovable"))?;

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo confirmar el registro"))?;

        Ok(Response::new(AuthResponse {
            user_id: user.id.to_string(),
            access_token,
            refresh_token,
            full_name: user.full_name,
            email: email.as_str().to_string(),
            current_level: user.current_level,
            target_role: user.target_role,
        }))
    }

    async fn login(
        &self,
        request: Request<LoginRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let req = request.into_inner();
        let email =
            Email::parse(&req.email).map_err(|e| Status::invalid_argument(e.to_string()))?;

        // Buscar usuario en PostgreSQL
        let row: Option<(uuid::Uuid, String, String, String, String)> = sqlx::query_as(
            "SELECT id, password_hash, full_name, target_role, current_level FROM users WHERE email = $1"
        )
        .bind(email.as_str())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (user_id, password_hash, full_name, target_role, current_level) =
            row.ok_or_else(|| Status::not_found("Usuario o contraseña incorrectos"))?;

        if !PasswordService::verify_password(&req.password, &password_hash) {
            return Err(Status::unauthenticated("Usuario o contraseña incorrectos"));
        }

        let access_token = JwtService::generate_token(user_id, email.as_str(), &target_role)
            .map_err(|_| Status::internal("No se pudo crear la sesión de usuario"))?;

        let refresh_token = generate_refresh_token();
        sqlx::query(
            "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3))"
        )
        .bind(user_id)
        .bind(hash_refresh_token(&refresh_token))
        .bind(REFRESH_TOKEN_TTL_DAYS)
        .execute(self.pool.as_ref())
        .await
        .map_err(|_| Status::internal("No se pudo crear la sesión renovable"))?;

        Ok(Response::new(AuthResponse {
            user_id: user_id.to_string(),
            access_token,
            refresh_token,
            full_name,
            email: email.as_str().to_string(),
            current_level,
            target_role,
        }))
    }

    async fn validate_token(
        &self,
        request: Request<ValidateTokenRequest>,
    ) -> Result<Response<ValidateTokenResponse>, Status> {
        let req = request.into_inner();
        match JwtService::validate_token(&req.token) {
            Ok(claims) => Ok(Response::new(ValidateTokenResponse {
                valid: true,
                user_id: claims.sub,
                email: claims.email,
                role: claims.role,
            })),
            Err(_) => Ok(Response::new(ValidateTokenResponse {
                valid: false,
                user_id: "".to_string(),
                email: "".to_string(),
                role: "".to_string(),
            })),
        }
    }

    async fn refresh_token(
        &self,
        request: Request<RefreshTokenRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let raw_token = request.into_inner().refresh_token;
        if raw_token.trim().is_empty() {
            return Err(Status::unauthenticated("Refresh token requerido"));
        }
        let presented_hash = hash_refresh_token(&raw_token);
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la renovación de sesión"))?;

        let row: Option<(Uuid, String, String, String, String, Uuid)> = sqlx::query_as(
            r#"
            SELECT u.id, u.email, u.full_name, u.target_role, u.current_level, t.id
            FROM auth_refresh_tokens t
            JOIN users u ON u.id = t.user_id
            WHERE t.token_hash = $1
              AND t.revoked_at IS NULL
              AND t.expires_at > NOW()
            FOR UPDATE OF t
            "#,
        )
        .bind(&presented_hash)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo validar la renovación de sesión"))?;

        let (user_id, email, full_name, target_role, current_level, token_id) =
            row.ok_or_else(|| {
                Status::unauthenticated("Refresh token inválido, expirado o revocado")
            })?;

        let revoked = sqlx::query(
            "UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL"
        )
        .bind(token_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo rotar el refresh token"))?;
        if revoked.rows_affected() != 1 {
            return Err(Status::unauthenticated(
                "Refresh token inválido, expirado o revocado",
            ));
        }

        let access_token = JwtService::generate_token(user_id, &email, &target_role)
            .map_err(|_| Status::internal("No se pudo renovar la sesión"))?;
        let refresh_token = generate_refresh_token();

        sqlx::query(
            "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3))"
        )
        .bind(user_id)
        .bind(hash_refresh_token(&refresh_token))
        .bind(REFRESH_TOKEN_TTL_DAYS)
        .execute(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo crear el refresh token rotado"))?;

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo confirmar la renovación de sesión"))?;

        Ok(Response::new(AuthResponse {
            user_id: user_id.to_string(),
            access_token,
            refresh_token,
            full_name,
            email,
            current_level,
            target_role,
        }))
    }

    async fn revoke_refresh_token(
        &self,
        request: Request<RevokeRefreshTokenRequest>,
    ) -> Result<Response<RevokeRefreshTokenResponse>, Status> {
        let raw_token = request.into_inner().refresh_token;
        if raw_token.trim().is_empty() {
            return Err(Status::invalid_argument("refresh_token requerido"));
        }

        let result = sqlx::query(
            "UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL"
        )
        .bind(hash_refresh_token(&raw_token))
        .execute(self.pool.as_ref())
        .await
        .map_err(|_| Status::internal("No se pudo cerrar la sesión"))?;

        Ok(Response::new(RevokeRefreshTokenResponse {
            revoked: result.rows_affected() > 0,
        }))
    }

    async fn get_user_profile(
        &self,
        request: Request<GetUserProfileRequest>,
    ) -> Result<Response<UserProfileResponse>, Status> {
        let authenticated_user_id = authenticated_user_id(&request)?;
        let req = request.into_inner();
        let user_id = enforce_user_scope(authenticated_user_id, &req.user_id)?;

        let row: Option<(Uuid, String, String, String, String)> = sqlx::query_as(
            "SELECT id, email, full_name, target_role, current_level FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (id, email, full_name, target_role, current_level) =
            row.ok_or_else(|| Status::not_found("Usuario no encontrado"))?;

        Ok(Response::new(UserProfileResponse {
            user_id: id.to_string(),
            email,
            full_name,
            target_role,
            current_level,
        }))
    }

    async fn update_user_profile(
        &self,
        request: Request<UpdateUserProfileRequest>,
    ) -> Result<Response<UserProfileResponse>, Status> {
        let authenticated_user_id = authenticated_user_id(&request)?;
        let req = request.into_inner();
        let user_id = enforce_user_scope(authenticated_user_id, &req.user_id)?;
        tracing::info!("👤 [AUTH] Solicitud de actualización de perfil para usuario autenticado");

        let row: Option<(Uuid, String, String, String, String)> = sqlx::query_as(
            r#"
            UPDATE users
            SET full_name = CASE WHEN $2 <> '' THEN $2 ELSE full_name END,
                target_role = CASE WHEN $3 <> '' THEN $3 ELSE target_role END,
                current_level = CASE WHEN $4 <> '' THEN $4 ELSE current_level END
            WHERE id = $1
            RETURNING id, email, full_name, target_role, current_level
            "#,
        )
        .bind(user_id)
        .bind(&req.full_name)
        .bind(&req.target_role)
        .bind(&req.current_level)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| {
            tracing::error!("❌ [AUTH] Error DB actualizando perfil: {}", e);
            Status::internal(e.to_string())
        })?;

        let (id, email, full_name, target_role, current_level) = row.ok_or_else(|| {
            tracing::warn!("⚠️ [AUTH] Usuario no encontrado para ID: {}", user_id);
            Status::not_found("Usuario no encontrado para actualizar")
        })?;

        tracing::info!(
            "✅ [AUTH] Perfil actualizado exitosamente para {}: role={}, level={}",
            email,
            target_role,
            current_level
        );

        Ok(Response::new(UserProfileResponse {
            user_id: id.to_string(),
            email,
            full_name,
            target_role,
            current_level,
        }))
    }
}

#[cfg(test)]
mod authorization_tests {
    use super::enforce_user_scope;
    use tonic::Code;
    use uuid::Uuid;

    #[test]
    fn permits_access_to_own_profile() {
        let user_id = Uuid::new_v4();
        assert_eq!(
            enforce_user_scope(user_id, &user_id.to_string()).unwrap(),
            user_id
        );
    }

    #[test]
    fn rejects_access_to_another_users_profile() {
        let authenticated_user = Uuid::new_v4();
        let other_user = Uuid::new_v4();
        let error = enforce_user_scope(authenticated_user, &other_user.to_string()).unwrap_err();
        assert_eq!(error.code(), Code::PermissionDenied);
    }

    #[test]
    fn rejects_malformed_profile_id() {
        let error = enforce_user_scope(Uuid::new_v4(), "not-a-uuid").unwrap_err();
        assert_eq!(error.code(), Code::InvalidArgument);
    }
}

#[cfg(test)]
mod refresh_token_tests {
    use super::{generate_refresh_token, hash_refresh_token};

    #[test]
    fn refresh_tokens_are_opaque_and_have_expected_length() {
        let first = generate_refresh_token();
        let second = generate_refresh_token();
        assert_eq!(first.len(), 64);
        assert_ne!(first, second);
        assert!(first.chars().all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn refresh_token_digest_is_fixed_length_and_deterministic() {
        let token = generate_refresh_token();
        let hash = hash_refresh_token(&token);
        assert_eq!(hash.len(), 64);
        assert_ne!(hash, token);
        assert_eq!(hash, hash_refresh_token(&token));
    }
}

#[cfg(test)]
mod refresh_token_integration_tests {
    use super::{generate_refresh_token, hash_refresh_token, MyAuthService};
    use proto::auth::auth_service_server::AuthService;
    use proto::auth::{RefreshTokenRequest, RevokeRefreshTokenRequest};
    use sqlx::postgres::PgPoolOptions;
    use std::sync::Arc;
    use tonic::Code;
    use uuid::Uuid;

    /// Requires the CI-provided TEST_DATABASE_URL after the repository migrations
    /// have been applied. The test creates and removes its own user.
    #[tokio::test]
    async fn refresh_rotation_replay_and_logout_revocation_are_enforced(
    ) -> Result<(), Box<dyn std::error::Error>> {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            eprintln!(
                "TEST_DATABASE_URL is not configured; skipping refresh-token integration test"
            );
            return Ok(());
        };

        let prior_secret = std::env::var("JWT_SECRET").ok();
        std::env::set_var("JWT_SECRET", "refresh-token-test-secret-0123456789abcdef");
        let pool = PgPoolOptions::new()
            .max_connections(2)
            .connect(&database_url)
            .await?;
        let user_id = Uuid::new_v4();
        let email = format!("refresh-{}@example.invalid", user_id);
        sqlx::query(
            "INSERT INTO users (id, email, password_hash, full_name, target_role, current_level) VALUES ($1, $2, 'not-a-login-hash', 'Refresh Integration', 'BACKEND', 'A2')"
        )
        .bind(user_id)
        .bind(&email)
        .execute(&pool)
        .await?;

        let expired_token = generate_refresh_token();
        sqlx::query(
            "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() - INTERVAL '1 day')"
        )
        .bind(user_id)
        .bind(hash_refresh_token(&expired_token))
        .execute(&pool)
        .await?;

        let initial_token = generate_refresh_token();
        sqlx::query(
            "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')"
        )
        .bind(user_id)
        .bind(hash_refresh_token(&initial_token))
        .execute(&pool)
        .await?;

        let service = MyAuthService::new(Arc::new(pool.clone()));
        let expired = service
            .refresh_token(tonic::Request::new(RefreshTokenRequest {
                refresh_token: expired_token,
            }))
            .await
            .unwrap_err();
        assert_eq!(expired.code(), Code::Unauthenticated);

        let stored_hash: String = sqlx::query_scalar(
            "SELECT token_hash FROM auth_refresh_tokens WHERE user_id = $1 AND token_hash = $2",
        )
        .bind(user_id)
        .bind(hash_refresh_token(&initial_token))
        .fetch_one(&pool)
        .await?;
        assert_ne!(
            stored_hash, initial_token,
            "database must not store the raw refresh token"
        );
        let rotated = service
            .refresh_token(tonic::Request::new(RefreshTokenRequest {
                refresh_token: initial_token.clone(),
            }))
            .await?
            .into_inner();

        assert_eq!(rotated.user_id, user_id.to_string());
        assert!(!rotated.access_token.is_empty());
        assert_ne!(rotated.refresh_token, initial_token);

        let replay = service
            .refresh_token(tonic::Request::new(RefreshTokenRequest {
                refresh_token: initial_token,
            }))
            .await
            .unwrap_err();
        assert_eq!(replay.code(), Code::Unauthenticated);

        let revoked = service
            .revoke_refresh_token(tonic::Request::new(RevokeRefreshTokenRequest {
                refresh_token: rotated.refresh_token.clone(),
            }))
            .await?
            .into_inner();
        assert!(revoked.revoked);

        let after_logout = service
            .refresh_token(tonic::Request::new(RefreshTokenRequest {
                refresh_token: rotated.refresh_token,
            }))
            .await
            .unwrap_err();
        assert_eq!(after_logout.code(), Code::Unauthenticated);

        // Concurrent refresh attempts using one token must never both succeed.
        let concurrent_token = generate_refresh_token();
        sqlx::query(
            "INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')"
        )
        .bind(user_id)
        .bind(hash_refresh_token(&concurrent_token))
        .execute(&pool)
        .await?;

        let (concurrent_a, concurrent_b) = tokio::join!(
            service.refresh_token(tonic::Request::new(RefreshTokenRequest {
                refresh_token: concurrent_token.clone(),
            })),
            service.refresh_token(tonic::Request::new(RefreshTokenRequest {
                refresh_token: concurrent_token,
            })),
        );
        let success_count = [concurrent_a.is_ok(), concurrent_b.is_ok()]
            .into_iter()
            .filter(|success| *success)
            .count();
        assert_eq!(
            success_count, 1,
            "a refresh token must be usable once, including under race"
        );

        sqlx::query("DELETE FROM users WHERE id = $1")
            .bind(user_id)
            .execute(&pool)
            .await?;
        pool.close().await;

        if let Some(secret) = prior_secret {
            std::env::set_var("JWT_SECRET", secret);
        } else {
            std::env::remove_var("JWT_SECRET");
        }

        Ok(())
    }
}
