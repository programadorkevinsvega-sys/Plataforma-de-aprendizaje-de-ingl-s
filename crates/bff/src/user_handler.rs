use axum::{extract::State, http::{StatusCode, HeaderMap}, Json};
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::auth_handler::{attach_bearer_token, extract_bearer_token};
use crate::srs_handler::{attach_bearer_metadata, validate_token_from_headers};

#[derive(Deserialize)]
pub struct UpdateProfileBody {
    pub full_name: Option<String>,
    pub target_role: Option<String>,
    pub current_level: Option<String>,
}

const MAX_PROFILE_NAME_CHARS: usize = 120;
const MAX_PROFILE_ROLE_CHARS: usize = 80;
const MAX_PROFILE_LEVEL_CHARS: usize = 20;

fn validate_update_profile_body(body: &UpdateProfileBody) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let has_value = body.full_name.as_ref().is_some_and(|value| !value.trim().is_empty())
        || body.target_role.as_ref().is_some_and(|value| !value.trim().is_empty())
        || body.current_level.as_ref().is_some_and(|value| !value.trim().is_empty());
    let too_long = body.full_name.as_ref().is_some_and(|value| value.chars().count() > MAX_PROFILE_NAME_CHARS)
        || body.target_role.as_ref().is_some_and(|value| value.chars().count() > MAX_PROFILE_ROLE_CHARS)
        || body.current_level.as_ref().is_some_and(|value| value.chars().count() > MAX_PROFILE_LEVEL_CHARS);
    if !has_value || too_long {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "Debes enviar al menos un campo de perfil válido y respetar los límites de tamaño.",
                "code": "INVALID_PROFILE_INPUT"
            })),
        ));
    }
    Ok(())
}

#[derive(Serialize)]
pub struct UserProfileDto {
    pub id: String,
    pub email: String,
    pub full_name: String,
    pub target_role: String,
    pub current_level: String,
}

/// PATCH /api/v1/users/me
pub async fn update_profile_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<UpdateProfileBody>,
) -> Result<Json<UserProfileDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    validate_update_profile_body(&body)?;
    let token = extract_bearer_token(&headers).ok_or_else(|| (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({ "message": "Token requerido", "code": "MISSING_TOKEN" })),
    ))?;

    let mut update_req = tonic::Request::new(proto::auth::UpdateUserProfileRequest {
        user_id: user_id.clone(),
        full_name: body.full_name.unwrap_or_default(),
        target_role: body.target_role.unwrap_or_default(),
        current_level: body.current_level.unwrap_or_default(),
    });
    attach_bearer_token(&mut update_req, &token)?;

    match state.auth_client.update_user_profile(update_req).await {
        Ok(res) => {
            let p = res.into_inner();
            Ok(Json(UserProfileDto {
                id: p.user_id,
                email: p.email,
                full_name: p.full_name,
                target_role: p.target_role,
                current_level: p.current_level,
            }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "message": "No se pudo actualizar el perfil.", "code": "PROFILE_UPDATE_UNAVAILABLE" })),
        )),
    }
}

#[derive(Debug, Deserialize)]
pub struct LogoutDto {
    pub refresh_token: String,
}

/// POST /api/v1/auth/logout — revokes the refresh token before clearing client state.
pub async fn logout_handler(
    State(mut state): State<AppState>,
    Json(payload): Json<LogoutDto>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if payload.refresh_token.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "Refresh token requerido para cerrar la sesión del servidor",
                "code": "MISSING_REFRESH_TOKEN"
            })),
        ));
    }

    let request = tonic::Request::new(proto::auth::RevokeRefreshTokenRequest {
        refresh_token: payload.refresh_token,
    });

    match state.auth_client.revoke_refresh_token(request).await {
        Ok(_) => Ok(Json(serde_json::json!({
            "message": "Sesión cerrada exitosamente",
            "success": true
        }))),
        Err(_) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "message": "No se pudo revocar la sesión en el servidor",
                "code": "LOGOUT_UNAVAILABLE"
            })),
        )),
    }
}

/// GET /api/v1/progress/summary — con datos reales del gamification service y user profile
pub async fn progress_summary_real_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;

    // Consultar perfil con el mismo JWT que se validó en el BFF.
    let token = extract_bearer_token(&headers).ok_or_else(|| (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({ "message": "Token requerido", "code": "MISSING_TOKEN" })),
    ))?;
    let mut profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
        user_id: user_id.clone(),
    });
    attach_bearer_token(&mut profile_req, &token)?;
    let profile = state.auth_client.get_user_profile(profile_req).await.map_err(|_| (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({
            "message": "No se pudo recuperar el perfil autenticado",
            "code": "PROFILE_UNAVAILABLE"
        })),
    ))?;
    let target_role = profile.into_inner().target_role;

    let mut stats_req = tonic::Request::new(proto::gamification::GetUserStatsRequest { user_id });
    attach_bearer_metadata(&headers, &mut stats_req)?;
    match state.gamification_client.get_user_stats(stats_req).await {
        Ok(res) => {
            let s = res.into_inner();
            Ok(Json(serde_json::json!({
                "streak_days": s.streak_days,
                "tech_coins": s.coins,
                "xp": s.xp,
                "current_level": s.current_level,
                "words_learned": s.words_learned,
                "target_role": target_role
            })))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "message": "El servicio de gamificación no está disponible.", "code": "GAMIFICATION_UNAVAILABLE" })),
        )),
    }
}

/// GET /api/v1/progress/leaderboard
pub async fn leaderboard_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    // Only logged in users can see the leaderboard
    let _user_id = validate_token_from_headers(&headers, &mut state).await?;

    let mut req = tonic::Request::new(proto::gamification::GetLeaderboardRequest { limit: 50 });
    attach_bearer_metadata(&headers, &mut req)?;
    match state.gamification_client.get_leaderboard(req).await {
        Ok(res) => {
            let entries = res.into_inner().entries;
            let mut mapped_entries = Vec::new();
            for (index, entry) in entries.into_iter().enumerate() {
                mapped_entries.push(serde_json::json!({
                    "rank": index + 1,
                    "user_id": entry.user_id,
                    "full_name": entry.full_name,
                    "current_level": entry.current_level,
                    "xp": entry.xp,
                    "streak_days": entry.streak_days,
                }));
            }
            Ok(Json(serde_json::json!(mapped_entries)))
        }
        Err(_error) => {
            Err((StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({
                "message": "El ranking no está disponible.",
                "code": "LEADERBOARD_UNAVAILABLE"
            }))))
        }
    }
}

/// GET /api/v1/progress/achievements
pub async fn achievements_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;

    let mut req = tonic::Request::new(proto::gamification::GetUserAchievementsRequest { user_id });
    attach_bearer_metadata(&headers, &mut req)?;
    match state.gamification_client.get_user_achievements(req).await {
        Ok(res) => {
            let achievements = res.into_inner().achievements;
            let mut mapped_achievements = Vec::new();
            for ach in achievements {
                mapped_achievements.push(serde_json::json!({
                    "id": ach.id,
                    "emoji": ach.emoji,
                    "title": ach.title,
                    "description": ach.description,
                    "unlocked": ach.unlocked,
                    "progress": ach.progress,
                    "max_progress": ach.max_progress,
                    "category": ach.category,
                }));
            }
            Ok(Json(serde_json::json!(mapped_achievements)))
        }
        Err(_error) => {
            Err((StatusCode::SERVICE_UNAVAILABLE, Json(serde_json::json!({
                "message": "Los logros no están disponibles.",
                "code": "ACHIEVEMENTS_UNAVAILABLE"
            }))))
        }
    }
}
