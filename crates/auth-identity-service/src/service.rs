use crate::domain::{PasswordService, User};
use crate::jwt::JwtService;
use common::Email;
use proto::auth::auth_service_server::AuthService;
use proto::auth::{
    AuthResponse, GetUserProfileRequest, LoginRequest, RegisterRequest, UpdateUserProfileRequest,
    UserProfileResponse, ValidateTokenRequest, ValidateTokenResponse,
};
use sqlx::PgPool;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

pub struct MyAuthService {
    pub pool: Arc<PgPool>,
}

impl MyAuthService {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[tonic::async_trait]
impl AuthService for MyAuthService {
    async fn register(
        &self,
        request: Request<RegisterRequest>,
    ) -> Result<Response<AuthResponse>, Status> {
        let req = request.into_inner();

        let email = Email::parse(&req.email)
            .map_err(|e| Status::invalid_argument(e.to_string()))?;

        // Verificar si el usuario ya existe
        let existing: Option<(uuid::Uuid,)> =
            sqlx::query_as("SELECT id FROM users WHERE email = $1")
                .bind(email.as_str())
                .fetch_optional(self.pool.as_ref())
                .await
                .map_err(|e| Status::internal(e.to_string()))?;

        if existing.is_some() {
            return Err(Status::already_exists("El usuario ya existe con ese correo"));
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
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(format!("Error al guardar usuario: {}", e)))?;

        // Inicializar stats de gamificación
        sqlx::query(
            "INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered) VALUES ($1, 0, 0, 50, 0, 0) ON CONFLICT (user_id) DO NOTHING"
        )
        .bind(user.id)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(format!("Error al inicializar stats: {}", e)))?;

        let access_token = JwtService::generate_token(user.id, email.as_str(), &user.target_role)
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(AuthResponse {
            user_id: user.id.to_string(),
            access_token,
            refresh_token: "refresh_token_placeholder".to_string(),
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
        let email = Email::parse(&req.email)
            .map_err(|e| Status::invalid_argument(e.to_string()))?;

        // Buscar usuario en PostgreSQL
        let row: Option<(uuid::Uuid, String, String, String, String)> = sqlx::query_as(
            "SELECT id, password_hash, full_name, target_role, current_level FROM users WHERE email = $1"
        )
        .bind(email.as_str())
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (user_id, password_hash, full_name, target_role, current_level) = row
            .ok_or_else(|| Status::not_found("Usuario o contraseña incorrectos"))?;

        if !PasswordService::verify_password(&req.password, &password_hash) {
            return Err(Status::unauthenticated("Usuario o contraseña incorrectos"));
        }

        let access_token = JwtService::generate_token(user_id, email.as_str(), &target_role)
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(AuthResponse {
            user_id: user_id.to_string(),
            access_token,
            refresh_token: "refresh_token_placeholder".to_string(),
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

    async fn get_user_profile(
        &self,
        request: Request<GetUserProfileRequest>,
    ) -> Result<Response<UserProfileResponse>, Status> {
        let req = request.into_inner();
        let user_id = Uuid::parse_str(&req.user_id)
            .map_err(|_| Status::invalid_argument("user_id inválido"))?;

        let row: Option<(Uuid, String, String, String, String)> = sqlx::query_as(
            "SELECT id, email, full_name, target_role, current_level FROM users WHERE id = $1"
        )
        .bind(user_id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (id, email, full_name, target_role, current_level) = row
            .ok_or_else(|| Status::not_found("Usuario no encontrado"))?;

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
        let req = request.into_inner();
        tracing::info!("👤 [AUTH] Solicitud de actualización de perfil para user_id: {}", req.user_id);
        let user_id = Uuid::parse_str(&req.user_id)
            .map_err(|e| {
                tracing::error!("❌ [AUTH] user_id inválido '{}': {}", req.user_id, e);
                Status::invalid_argument("user_id inválido")
            })?;

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

        let (id, email, full_name, target_role, current_level) = row
            .ok_or_else(|| {
                tracing::warn!("⚠️ [AUTH] Usuario no encontrado para ID: {}", user_id);
                Status::not_found("Usuario no encontrado para actualizar")
            })?;

        tracing::info!("✅ [AUTH] Perfil actualizado exitosamente para {}: role={}, level={}", email, target_role, current_level);

        Ok(Response::new(UserProfileResponse {
            user_id: id.to_string(),
            email,
            full_name,
            target_role,
            current_level,
        }))
    }
}
