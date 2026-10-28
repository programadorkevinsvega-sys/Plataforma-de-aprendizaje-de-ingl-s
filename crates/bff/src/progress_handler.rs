use crate::AppState;
use crate::srs_handler::{attach_bearer_metadata, validate_token_from_headers};
use axum::{
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use proto::gamification::RecordLearningProgressRequest;
use proto::srs::AddCardsToDeckRequest;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct RecordProgressDto {
    pub word_id: String,
}

#[derive(Serialize)]
pub struct ProgressResponseDto {
    pub success: bool,
    pub xp_gained: i32,
    pub coins_gained: i32,
    pub cards_added_to_deck: i32,
    pub new_streak: i32,
}

/// POST /api/v1/progress/learn
pub async fn record_progress_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<RecordProgressDto>,
) -> Result<Json<ProgressResponseDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    if payload.word_id.trim().is_empty() || payload.word_id.len() > 128 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "El identificador de vocabulario no es válido.",
                "code": "INVALID_WORD_ID"
            })),
        ));
    }
    let mut gamification_client = state.gamification_client.clone();
    let mut srs_client = state.srs_client.clone();

    // 1. Agregar cartas al mazo (SRS)
    let mut srs_req = tonic::Request::new(AddCardsToDeckRequest {
        user_id: user_id.clone(),
        word_id: payload.word_id.clone(),
    });
    attach_bearer_metadata(&headers, &mut srs_req)?;

    let srs_res = srs_client
        .add_cards_to_deck(srs_req)
        .await
        .map_err(|_error| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "message": "No se pudo actualizar el repaso de vocabulario.", "code": "SRS_UNAVAILABLE" })),
            )
        })?;
    
    let cards_added = srs_res.into_inner().cards_added;

    // 2. Registrar progreso de gamificación (+10 XP, +2 Coins, +1 Palabra aprendida)
    let mut gamification_req = tonic::Request::new(RecordLearningProgressRequest {
        user_id: user_id.clone(),
        xp_amount: 10,
        coins_amount: 2,
        words_learned_delta: 1,
        word_id: payload.word_id.clone(),
    });
    attach_bearer_metadata(&headers, &mut gamification_req)?;

    let gamification_res = gamification_client
        .record_learning_progress(gamification_req)
        .await
        .map_err(|_error| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({ "message": "No se pudo registrar el progreso.", "code": "GAMIFICATION_UNAVAILABLE" })),
            )
        })?;
    
    let result = gamification_res.into_inner();
    let stats = result.stats.ok_or_else(|| (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({
            "message": "El servicio de gamificación no devolvió estadísticas.",
            "code": "GAMIFICATION_RESPONSE_INVALID"
        })),
    ))?;

    Ok(Json(ProgressResponseDto {
        success: true,
        xp_gained: result.xp_gained,
        coins_gained: result.coins_gained,
        cards_added_to_deck: cards_added,
        new_streak: stats.streak_days,
    }))
}
