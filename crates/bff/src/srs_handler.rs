use axum::{extract::State, http::HeaderMap, http::StatusCode, Json};
use proto::srs::{GetDueCardsRequest, ReviewCardRequest};
use serde::{Deserialize, Serialize};

use crate::AppState;

#[derive(Serialize)]
pub struct SrsCardDto {
    pub id: String,
    pub sentence_id: String,
    pub english_text: String,
    pub spanish_phonetic: String,
    pub spanish_translation: String,
    pub easiness_factor: f32,
    pub interval_days: i32,
    pub repetitions: i32,
    pub next_review: String,
}

#[derive(Serialize)]
pub struct DueCardsDto {
    pub cards: Vec<SrsCardDto>,
    pub total: i32,
}

#[derive(Serialize)]
pub struct ReviewOutcomeDto {
    pub card_id: String,
    pub new_interval_days: i32,
    pub new_easiness_factor: f32,
    pub next_review_at: String,
}

#[derive(Deserialize)]
pub struct ReviewBody {
    pub grade: Option<i32>,
}

pub(crate) fn attach_bearer_metadata<T>(
    headers: &HeaderMap,
    request: &mut tonic::Request<T>,
) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let token = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                Json(serde_json::json!({ "message": "Token requerido", "code": "MISSING_TOKEN" })),
            )
        })?;

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

/// GET /api/v1/srs/due
pub async fn get_due_cards_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<DueCardsDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;

    let mut request = tonic::Request::new(GetDueCardsRequest { user_id, limit: 20 });
    attach_bearer_metadata(&headers, &mut request)?;

    match state.srs_client.get_due_cards(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            let cards = inner
                .cards
                .into_iter()
                .map(|c| SrsCardDto {
                    id: c.id,
                    sentence_id: c.sentence_id,
                    english_text: c.english_text,
                    spanish_phonetic: c.spanish_phonetic,
                    spanish_translation: c.spanish_translation,
                    easiness_factor: c.easiness_factor,
                    interval_days: c.interval_days,
                    repetitions: c.repetitions,
                    next_review: c.next_review,
                })
                .collect();
            Ok(Json(DueCardsDto {
                cards,
                total: inner.total,
            }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "message": "El servicio de repaso no está disponible.", "code": "SRS_UNAVAILABLE" }),
            ),
        )),
    }
}

/// POST /api/v1/srs/cards/:id/review
pub async fn review_card_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(card_id): axum::extract::Path<String>,
    Json(body): Json<ReviewBody>,
) -> Result<Json<ReviewOutcomeDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    if card_id.trim().is_empty()
        || card_id.len() > 128
        || body.grade.is_some_and(|grade| !(0..=5).contains(&grade))
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "El identificador de tarjeta o la calificación no son válidos.",
                "code": "INVALID_SRS_REVIEW"
            })),
        ));
    }

    let mut request = tonic::Request::new(ReviewCardRequest {
        user_id,
        card_id,
        grade: body.grade.unwrap_or(3),
    });
    attach_bearer_metadata(&headers, &mut request)?;

    match state.srs_client.review_card(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            Ok(Json(ReviewOutcomeDto {
                card_id: inner.card_id,
                new_interval_days: inner.new_interval_days,
                new_easiness_factor: inner.new_easiness_factor,
                next_review_at: inner.next_review_at,
            }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "message": "No se pudo registrar la revisión.", "code": "SRS_REVIEW_UNAVAILABLE" }),
            ),
        )),
    }
}

/// Extrae y valida el JWT desde los headers — retorna user_id
pub async fn validate_token_from_headers(
    headers: &HeaderMap,
    state: &mut AppState,
) -> Result<String, (StatusCode, Json<serde_json::Value>)> {
    let token = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or("")
        .to_string();

    if token.is_empty() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "Token requerido", "code": "MISSING_TOKEN" })),
        ));
    }

    let validate_req = tonic::Request::new(proto::auth::ValidateTokenRequest { token });
    match state.auth_client.validate_token(validate_req).await {
        Ok(res) => {
            let inner = res.into_inner();
            if !inner.valid
                || inner.user_id.trim().is_empty()
                || uuid::Uuid::parse_str(&inner.user_id).is_err()
            {
                return Err((
                    StatusCode::UNAUTHORIZED,
                    Json(
                        serde_json::json!({ "message": "Token inválido", "code": "INVALID_TOKEN" }),
                    ),
                ));
            }
            Ok(inner.user_id)
        }
        Err(_) => Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "Token inválido", "code": "INVALID_TOKEN" })),
        )),
    }
}
