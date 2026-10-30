use axum::http::StatusCode;
use axum::{extract::State, http::HeaderMap, Json};
use proto::content::ListVocabularyWordsRequest;
use serde::Serialize;

use crate::srs_handler::{attach_bearer_metadata, validate_token_from_headers};
use crate::AppState;

#[derive(Serialize)]
pub struct ContextSentenceDto {
    pub id: String,
    pub english_text: String,
    pub spanish_phonetic: String,
    pub spanish_phonetic_natural: String,
    pub spanish_translation: String,
    pub audio_url: String,
}

#[derive(Serialize)]
pub struct VocabularyWordDto {
    pub id: String,
    pub word: String,
    pub spanish_phonetic: String,
    pub spanish_phonetic_natural: String,
    pub spanish_translation: String,
    pub category: String,
    pub level: String,
    pub context_sentences: Vec<ContextSentenceDto>,
}

#[derive(Serialize)]
pub struct VocabularyListDto {
    pub items: Vec<VocabularyWordDto>,
    pub total: i32,
}

#[derive(Serialize)]
pub struct LessonDto {
    pub id: String,
    pub title: String,
    pub description: String,
    pub words: Vec<VocabularyWordDto>,
}

/// GET /api/v1/content/vocabulary
pub async fn vocabulary_list_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<VocabularyListDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut client = state.content_client.clone();

    let mut profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
        user_id: user_id.clone(),
    });
    attach_bearer_metadata(&headers, &mut profile_req)?;
    let user_level = state
        .auth_client
        .get_user_profile(profile_req)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "message": "No se pudo recuperar el perfil autenticado.",
                    "code": "PROFILE_UNAVAILABLE"
                })),
            )
        })?
        .into_inner()
        .current_level;

    let mut request = tonic::Request::new(ListVocabularyWordsRequest {
        level: user_level,
        category: "".to_string(),
        limit: 1000,
        offset: 0,
        user_id,
    });
    attach_bearer_metadata(&headers, &mut request)?;

    match client.list_vocabulary_words(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            let items = inner
                .words
                .into_iter()
                .map(|w| VocabularyWordDto {
                    id: w.id,
                    word: w.word,
                    spanish_phonetic: w.spanish_phonetic,
                    spanish_phonetic_natural: w.spanish_phonetic_natural,
                    spanish_translation: w.spanish_translation,
                    category: w.category,
                    level: w.level,
                    context_sentences: w
                        .context_sentences
                        .into_iter()
                        .map(|s| ContextSentenceDto {
                            id: s.id,
                            english_text: s.english_text,
                            spanish_phonetic: s.spanish_phonetic,
                            spanish_phonetic_natural: s.spanish_phonetic_natural,
                            spanish_translation: s.spanish_translation,
                            audio_url: s.audio_url,
                        })
                        .collect(),
                })
                .collect();
            let total = inner.total;
            Ok(Json(VocabularyListDto { items, total }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "message": "El servicio de contenido no está disponible.", "code": "CONTENT_UNAVAILABLE" }),
            ),
        )),
    }
}

/// GET /api/v1/content/lessons/today
pub async fn today_lesson_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LessonDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut client = state.content_client.clone();

    let mut profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
        user_id: user_id.clone(),
    });
    attach_bearer_metadata(&headers, &mut profile_req)?;
    let user_level = state
        .auth_client
        .get_user_profile(profile_req)
        .await
        .map_err(|_| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(serde_json::json!({
                    "message": "No se pudo recuperar el perfil autenticado.",
                    "code": "PROFILE_UNAVAILABLE"
                })),
            )
        })?
        .into_inner()
        .current_level;

    let mut request = tonic::Request::new(ListVocabularyWordsRequest {
        level: user_level.clone(),
        category: "".to_string(),
        limit: 5,
        offset: 0,
        user_id,
    });
    attach_bearer_metadata(&headers, &mut request)?;

    match client.list_vocabulary_words(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            let words = inner
                .words
                .into_iter()
                .map(|w| VocabularyWordDto {
                    id: w.id,
                    word: w.word,
                    spanish_phonetic: w.spanish_phonetic,
                    spanish_phonetic_natural: w.spanish_phonetic_natural,
                    spanish_translation: w.spanish_translation,
                    category: w.category,
                    level: w.level,
                    context_sentences: w
                        .context_sentences
                        .into_iter()
                        .map(|s| ContextSentenceDto {
                            id: s.id,
                            english_text: s.english_text,
                            spanish_phonetic: s.spanish_phonetic,
                            spanish_phonetic_natural: s.spanish_phonetic_natural,
                            spanish_translation: s.spanish_translation,
                            audio_url: s.audio_url,
                        })
                        .collect(),
                })
                .collect();

            Ok(Json(LessonDto {
                id: "lesson-today".to_string(),
                title: "Vocabulario del Día — System Design".to_string(),
                description:
                    "Términos esenciales de arquitectura distribuida en contexto conversacional"
                        .to_string(),
                words,
            }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(
                serde_json::json!({ "message": "No se pudo recuperar la lección.", "code": "LESSON_UNAVAILABLE" }),
            ),
        )),
    }
}

/// POST /api/v1/content/speech — TTS real via AWS Polly Neural
pub async fn synthesize_speech_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    if !crate::request_limiter::allow_request(
        &user_id,
        "tts",
        20,
        std::time::Duration::from_secs(60),
    ) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "message": "Se alcanzó el límite temporal de síntesis de voz.",
                "code": "TTS_RATE_LIMITED"
            })),
        ));
    }

    let text = body
        .get("text")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if text.trim().is_empty() || text.chars().count() > 500 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "El texto debe contener entre 1 y 500 caracteres.",
                "code": "INVALID_SPEECH_TEXT"
            })),
        ));
    }

    use aws_sdk_polly::{
        config::Region,
        types::{Engine, OutputFormat, TextType, VoiceId},
        Client as PollyClient,
    };
    use std::env;

    let region = Region::new(env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string()));
    let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region)
        .load()
        .await;

    let polly_client = PollyClient::new(&sdk_config);

    let req_voice = body.get("voice").and_then(|v| v.as_str()).unwrap_or("");

    let req_rate = body.get("rate").and_then(|v| v.as_str()).unwrap_or("");
    if !req_rate.is_empty() && !matches!(req_rate, "slow" | "medium" | "fast") {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "La velocidad de voz no es válida.",
                "code": "INVALID_SPEECH_RATE"
            })),
        ));
    }

    let default_voice = env::var("AWS_POLLY_VOICE_ID").unwrap_or_else(|_| "Matthew".to_string());
    let voice_id_str = if !req_voice.is_empty() {
        req_voice
    } else {
        default_voice.as_str()
    };

    let voice_id = match voice_id_str {
        "Lupe" => VoiceId::Lupe,
        "Mia" => VoiceId::Mia,
        "Lucia" => VoiceId::Lucia,
        "Enrique" => VoiceId::Enrique,
        "Conchita" => VoiceId::Conchita,
        "Matthew" => VoiceId::Matthew,
        "Joanna" => VoiceId::Joanna,
        "Ruth" => VoiceId::Ruth,
        "Stephen" => VoiceId::Stephen,
        _ => VoiceId::Matthew,
    };

    // Si viene un rate (slow/medium/fast), envolvemos el texto en SSML <prosody>
    let (final_text, text_type) = if !req_rate.is_empty() {
        let safe_text = text
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;");
        let ssml = format!(
            "<speak><prosody rate=\"{}\">{}</prosody></speak>",
            req_rate, safe_text
        );
        (ssml, TextType::Ssml)
    } else {
        (text.clone(), TextType::Text)
    };

    tracing::info!(
        "Solicitud de síntesis de voz recibida (voz={}, rate={})",
        voice_id_str,
        if req_rate.is_empty() {
            "normal"
        } else {
            req_rate
        }
    );

    match polly_client
        .synthesize_speech()
        .text(&final_text)
        .text_type(text_type)
        .voice_id(voice_id)
        .engine(Engine::Neural)
        .output_format(OutputFormat::Mp3)
        .send()
        .await
    {
        Ok(response) => match response.audio_stream.collect().await {
            Ok(audio_data) => {
                let bytes_vec = audio_data.into_bytes().to_vec();
                let audio_b64 =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes_vec);
                tracing::info!(
                    "Polly TTS generó {} bytes MP3 para la voz {}",
                    bytes_vec.len(),
                    voice_id_str
                );
                Ok(Json(serde_json::json!({
                    "audio_base64": audio_b64,
                    "format": "mp3",
                    "voice": voice_id_str,
                    "text": text,
                })))
            }
            Err(_error) => {
                tracing::error!("Error interno recopilando el stream de audio de Polly");
                Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(
                        serde_json::json!({ "message": "El servicio de síntesis de voz no está disponible.", "code": "TTS_UNAVAILABLE" }),
                    ),
                ))
            }
        },
        Err(_error) => {
            tracing::error!("Error interno solicitando síntesis de voz a Polly");
            Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(
                    serde_json::json!({ "message": "El servicio de síntesis de voz no está disponible.", "code": "TTS_UNAVAILABLE" }),
                ),
            ))
        }
    }
}

/// POST /api/v1/content/vocabulary/:id/complete
pub async fn mark_word_complete_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(word_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    Ok(Json(
        serde_json::json!({ "user_id": user_id, "word_id": word_id, "completed": true }),
    ))
}
