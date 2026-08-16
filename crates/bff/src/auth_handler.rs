use axum::{extract::Request, http::StatusCode, Json};
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

// ─── DTOs de salida ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct AuthResponseDto {
    pub user_id: String,
    pub access_token: String,
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

pub async fn register_handler(
    axum::extract::State(mut state): axum::extract::State<AppState>,
    Json(payload): Json<RegisterDto>,
) -> Result<Json<AuthResponseDto>, (StatusCode, Json<serde_json::Value>)> {
    let request = tonic::Request::new(proto::auth::RegisterRequest {
        email: payload.email.clone(),
        password: payload.password,
        full_name: payload.full_name,
        target_role: payload.target_role.unwrap_or_else(|| "Software Developer".to_string()),
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
                full_name: inner.full_name,
                email: inner.email,
                current_level,
                target_role: if inner.target_role.is_empty() { "Software Developer".to_string() } else { inner.target_role },
            }))
        }
        Err(status) => Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": status.message(), "code": "REGISTER_ERROR" })),
        )),
    }
}

pub async fn login_handler(
    axum::extract::State(mut state): axum::extract::State<AppState>,
    Json(payload): Json<LoginDto>,
) -> Result<Json<AuthResponseDto>, (StatusCode, Json<serde_json::Value>)> {
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
                full_name: inner.full_name,
                email: inner.email,
                current_level: inner.current_level,
                target_role: if inner.target_role.is_empty() { "Software Developer".to_string() } else { inner.target_role },
            }))
        }
        Err(status) => Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": status.message(), "code": "INVALID_CREDENTIALS" })),
        )),
    }
}

/// GET /api/v1/auth/me
pub async fn me_handler(
    axum::extract::State(mut state): axum::extract::State<AppState>,
    req: Request,
) -> Result<Json<MeResponseDto>, (StatusCode, Json<serde_json::Value>)> {
    let token = req
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
        .to_string();

    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "Token de autorización requerido", "code": "MISSING_TOKEN" })),
        ));
    }

    let request = tonic::Request::new(proto::auth::ValidateTokenRequest { token });

    match state.auth_client.validate_token(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            if !inner.valid {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "message": "Token expirado o inválido", "code": "INVALID_TOKEN" })),
                ));
            }

            // Consultar perfil completo en PostgreSQL a través de auth_client
            let profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
                user_id: inner.user_id.clone(),
            });

            let (full_name, target_role, current_level) = match state.auth_client.get_user_profile(profile_req).await {
                Ok(pres) => {
                    let p = pres.into_inner();
                    (p.full_name, p.target_role, p.current_level)
                }
                Err(_) => (
                    "Usuario DevFluency".to_string(),
                    "SOFTWARE_ENGINEER".to_string(),
                    "A2".to_string(),
                ),
            };

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
        Err(status) => Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": status.message(), "code": "TOKEN_VALIDATION_ERROR" })),
        )),
    }
}
