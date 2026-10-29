use axum::{
    extract::Request,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::{Deserialize, Serialize};

use crate::AppState;

// ─── DTOs de entrada ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct RegisterDto {
    pub email: String,
    pub password: String,
    pub full_name: String,
    pub target_role: Option<String>,
    pub current_level: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginDto {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshDto {
    pub refresh_token: String,
}

const MAX_EMAIL_CHARS: usize = 254;
const MAX_PASSWORD_CHARS: usize = 128;
const MAX_FULL_NAME_CHARS: usize = 120;
const MAX_TARGET_ROLE_CHARS: usize = 80;
const MAX_CURRENT_LEVEL_CHARS: usize = 20;

fn validate_register_input(
    payload: &RegisterDto,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if payload.email.trim().is_empty()
        || payload.email.chars().count() > MAX_EMAIL_CHARS
        || !payload.email.contains('@')
        || payload.password.is_empty()
        || payload.password.chars().count() > MAX_PASSWORD_CHARS
        || payload.full_name.trim().is_empty()
        || payload.full_name.chars().count() > MAX_FULL_NAME_CHARS
        || payload
            .target_role
            .as_ref()
            .is_some_and(|value| value.chars().count() > MAX_TARGET_ROLE_CHARS)
        || payload
            .current_level
            .as_ref()
            .is_some_and(|value| value.chars().count() > MAX_CURRENT_LEVEL_CHARS)
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "Los campos de registro no cumplen el formato o los límites permitidos.",
                "code": "INVALID_REGISTRATION_INPUT"
            })),
        ));
    }
    Ok(())
}

fn validate_login_input(payload: &LoginDto) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if payload.email.trim().is_empty()
        || payload.email.chars().count() > MAX_EMAIL_CHARS
        || !payload.email.contains('@')
        || payload.password.is_empty()
        || payload.password.chars().count() > MAX_PASSWORD_CHARS
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "Las credenciales tienen un formato o tamaño no válido.",
                "code": "INVALID_LOGIN_INPUT"
            })),
        ));
    }
    Ok(())
}

fn normalize_email_for_rate_limit(email: &str) -> String {
    email.trim().to_ascii_lowercase()
}

fn allow_auth_attempt(email: &str, action: &str, quotas: &[(&str, usize, u64)]) -> bool {
    let normalized_email = normalize_email_for_rate_limit(email);
    if normalized_email.is_empty() {
        return false;
    }

    let key = format!("email:{normalized_email}");
    let mut allowed = true;
    for (window_name, limit, seconds) in quotas {
        // Evaluate each window even when another one is exhausted so the longer
        // window continues counting rejected attempts.
        let window_allowed = crate::request_limiter::allow_request(
            &key,
            &format!("auth-{action}-{window_name}"),
            *limit,
            std::time::Duration::from_secs(*seconds),
        );
        allowed = window_allowed && allowed;
    }
    allowed
}

fn allow_login_attempt(email: &str) -> bool {
    allow_auth_attempt(email, "login", &[("minute", 5, 60), ("hour", 20, 3600)])
}

fn allow_registration_attempt(email: &str) -> bool {
    allow_auth_attempt(
        email,
        "registration",
        &[("hour", 3, 3600), ("day", 10, 86400)],
    )
}

// ─── DTOs de salida ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AuthResponseDto {
    pub user_id: String,
    pub access_token: String,
    pub refresh_token: String,
    pub full_name: String,
    pub email: String,
    pub current_level: String,
    pub target_role: String,
    pub tenant_id: String,
}

#[derive(Debug, Serialize)]
pub struct MeResponseDto {
    pub user_id: String,
    pub email: String,
    pub full_name: String,
    pub target_role: String,
    pub current_level: String,
    pub role: String,
    pub valid: bool,
}

// ─── Handlers ────────────────────────────────────────────────────────────────

/// Obtiene un bearer token de una cabecera HTTP Authorization válida.
pub fn extract_bearer_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|token| !token.is_empty())
        .map(str::to_owned)
}

/// Propaga el JWT del usuario a las operaciones gRPC que acceden al perfil.
pub fn attach_bearer_token<T>(
    request: &mut tonic::Request<T>,
    token: &str,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let value =
        tonic::metadata::MetadataValue::try_from(format!("Bearer {token}")).map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "message": "Token inválido", "code": "INVALID_TOKEN" })),
            )
        })?;
    request.metadata_mut().insert("authorization", value);
    Ok(())
}

pub async fn register_handler(
    axum::extract::State(mut state): axum::extract::State<AppState>,
    Json(payload): Json<RegisterDto>,
) -> Result<Json<AuthResponseDto>, (StatusCode, Json<serde_json::Value>)> {
    validate_register_input(&payload)?;
    if !allow_registration_attempt(&payload.email) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "message": "Se alcanzó el límite temporal de registros para este correo.",
                "code": "REGISTRATION_RATE_LIMITED"
            })),
        ));
    }
    let request = tonic::Request::new(proto::auth::RegisterRequest {
        email: payload.email.clone(),
        password: payload.password,
        full_name: payload.full_name,
        target_role: payload
            .target_role
            .unwrap_or_else(|| "Software Developer".to_string()),
    });

    match state.auth_client.register(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            let current_level = if let Some(level) = payload.current_level {
                level
            } else {
                inner.current_level
            };
            Ok(Json(AuthResponseDto {
                tenant_id: inner.user_id.clone(),
                user_id: inner.user_id,
                access_token: inner.access_token,
                refresh_token: inner.refresh_token,
                full_name: inner.full_name,
                email: inner.email,
                current_level,
                target_role: if inner.target_role.is_empty() {
                    "Software Developer".to_string()
                } else {
                    inner.target_role
                },
            }))
        }
        Err(status) => {
            tracing::warn!(code = ?status.code(), "Falló una solicitud de registro");
            Err((
                StatusCode::BAD_REQUEST,
                Json(
                    serde_json::json!({ "message": "No se pudo completar el registro.", "code": "REGISTER_ERROR" }),
                ),
            ))
        }
    }
}

pub async fn login_handler(
    axum::extract::State(mut state): axum::extract::State<AppState>,
    Json(payload): Json<LoginDto>,
) -> Result<Json<AuthResponseDto>, (StatusCode, Json<serde_json::Value>)> {
    validate_login_input(&payload)?;
    if !allow_login_attempt(&payload.email) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "message": "Se alcanzó el límite temporal de intentos de acceso para este correo.",
                "code": "LOGIN_RATE_LIMITED"
            })),
        ));
    }
    let request = tonic::Request::new(proto::auth::LoginRequest {
        email: payload.email,
        password: payload.password,
    });

    match state.auth_client.login(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            Ok(Json(AuthResponseDto {
                tenant_id: inner.user_id.clone(),
                user_id: inner.user_id,
                access_token: inner.access_token,
                refresh_token: inner.refresh_token,
                full_name: inner.full_name,
                email: inner.email,
                current_level: inner.current_level,
                target_role: if inner.target_role.is_empty() {
                    "Software Developer".to_string()
                } else {
                    inner.target_role
                },
            }))
        }
        Err(status) => {
            tracing::warn!(code = ?status.code(), "Falló un intento de login");
            Err((
                StatusCode::UNAUTHORIZED,
                Json(
                    serde_json::json!({ "message": "Correo o contraseña incorrectos.", "code": "INVALID_CREDENTIALS" }),
                ),
            ))
        }
    }
}

/// GET /api/v1/auth/me
pub async fn me_handler(
    axum::extract::State(mut state): axum::extract::State<AppState>,
    req: Request,
) -> Result<Json<MeResponseDto>, (StatusCode, Json<serde_json::Value>)> {
    let token = extract_bearer_token(req.headers()).unwrap_or_default();

    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(
                serde_json::json!({ "message": "Token de autorización requerido", "code": "MISSING_TOKEN" }),
            ),
        ));
    }

    let request = tonic::Request::new(proto::auth::ValidateTokenRequest {
        token: token.clone(),
    });

    match state.auth_client.validate_token(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            if !inner.valid {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(
                        serde_json::json!({ "message": "Token expirado o inválido", "code": "INVALID_TOKEN" }),
                    ),
                ));
            }

            // Consultar perfil completo en PostgreSQL a través de auth_client
            let mut profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
                user_id: inner.user_id.clone(),
            });
            attach_bearer_token(&mut profile_req, &token)?;

            let profile = state
                .auth_client
                .get_user_profile(profile_req)
                .await
                .map_err(|_| {
                    (
                        StatusCode::SERVICE_UNAVAILABLE,
                        Json(serde_json::json!({
                            "message": "No se pudo recuperar el perfil autenticado",
                            "code": "PROFILE_UNAVAILABLE"
                        })),
                    )
                })?;
            let profile = profile.into_inner();
            let (full_name, target_role, current_level) = (
                profile.full_name,
                profile.target_role,
                profile.current_level,
            );

            Ok(Json(MeResponseDto {
                user_id: inner.user_id,
                email: inner.email,
                full_name,
                target_role,
                current_level,
                role: inner.role,
                valid: true,
            }))
        }
        Err(_status) => Err((
            StatusCode::UNAUTHORIZED,
            Json(
                serde_json::json!({ "message": "No se pudo validar la sesión.", "code": "TOKEN_VALIDATION_ERROR" }),
            ),
        )),
    }
}

/// POST /api/v1/auth/refresh — consume and rotate a one-time refresh token.
pub async fn refresh_handler(
    axum::extract::State(mut state): axum::extract::State<AppState>,
    Json(payload): Json<RefreshDto>,
) -> Result<Json<AuthResponseDto>, (StatusCode, Json<serde_json::Value>)> {
    let request = tonic::Request::new(proto::auth::RefreshTokenRequest {
        refresh_token: payload.refresh_token,
    });

    match state.auth_client.refresh_token(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            Ok(Json(AuthResponseDto {
                tenant_id: inner.user_id.clone(),
                user_id: inner.user_id,
                access_token: inner.access_token,
                refresh_token: inner.refresh_token,
                full_name: inner.full_name,
                email: inner.email,
                current_level: inner.current_level,
                target_role: if inner.target_role.is_empty() {
                    "Software Developer".to_string()
                } else {
                    inner.target_role
                },
            }))
        }
        Err(_status) => Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({
                "message": "Refresh token inválido, expirado o revocado",
                "code": "INVALID_REFRESH_TOKEN"
            })),
        )),
    }
}

#[cfg(test)]
mod auth_input_validation_tests {
    use super::{validate_login_input, validate_register_input, LoginDto, RegisterDto};

    fn valid_register() -> RegisterDto {
        RegisterDto {
            email: "student@example.com".to_string(),
            password: "a-long-enough-test-password".to_string(),
            full_name: "Student Example".to_string(),
            target_role: Some("Backend Engineer".to_string()),
            current_level: Some("B1".to_string()),
        }
    }

    #[test]
    fn accepts_registration_within_limits() {
        assert!(validate_register_input(&valid_register()).is_ok());
    }

    #[test]
    fn rejects_oversized_registration_fields() {
        let mut payload = valid_register();
        payload.full_name = "x".repeat(121);
        assert!(validate_register_input(&payload).is_err());
    }

    #[test]
    fn rejects_invalid_email_before_calling_auth_service() {
        let mut payload = valid_register();
        payload.email = "not-an-email".to_string();
        assert!(validate_register_input(&payload).is_err());
    }

    #[test]
    fn rejects_oversized_login_password() {
        let payload = LoginDto {
            email: "student@example.com".to_string(),
            password: "x".repeat(129),
        };
        assert!(validate_login_input(&payload).is_err());
    }
}

#[cfg(test)]
mod auth_rate_limit_tests {
    use super::{allow_login_attempt, allow_registration_attempt, normalize_email_for_rate_limit};
    use uuid::Uuid;

    #[test]
    fn rate_limit_identifier_is_trimmed_and_case_normalized() {
        assert_eq!(
            normalize_email_for_rate_limit("  Student@Example.COM "),
            "student@example.com",
        );
    }

    #[test]
    fn login_attempts_are_limited_per_normalized_email() {
        let email = format!("login-{}@example.invalid", Uuid::new_v4());
        for _ in 0..5 {
            assert!(allow_login_attempt(&email));
        }
        assert!(!allow_login_attempt(&email.to_ascii_uppercase()));
    }

    #[test]
    fn registrations_have_a_separate_per_email_quota() {
        let email = format!("register-{}@example.invalid", Uuid::new_v4());
        for _ in 0..3 {
            assert!(allow_registration_attempt(&email));
        }
        assert!(!allow_registration_attempt(&email));
        assert!(
            allow_login_attempt(&email),
            "registration and login quotas are independent"
        );
    }

    #[test]
    fn rejects_an_empty_rate_limit_identifier() {
        assert!(!allow_login_attempt("  "));
        assert!(!allow_registration_attempt(""));
    }
}
