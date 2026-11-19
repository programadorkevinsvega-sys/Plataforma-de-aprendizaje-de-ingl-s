use axum::http::StatusCode;
use axum::{extract::{Query, State}, http::HeaderMap, Json};
use proto::content::{ListComprehensionResourcesRequest, ListVocabularyWordsRequest};
use proto::phonetic_audio::SynthesizeRequest;
use serde::{Deserialize, Serialize};

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
    pub page: i32,
    pub page_size: i32,
    pub total_pages: i32,
}

#[derive(Serialize)]
pub struct LessonDto {
    pub id: String,
    pub title: String,
    pub description: String,
    pub words: Vec<VocabularyWordDto>,
}

#[derive(Deserialize, Default)]
pub struct VocabularyListQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub level: Option<String>,
    pub category: Option<String>,
    pub track: Option<String>,
}

/// GET /api/v1/content/vocabulary
pub async fn vocabulary_list_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<VocabularyListQuery>,
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

    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(20);
    if page <= 0 || !(1..=50).contains(&page_size) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "La página debe ser positiva y page_size debe estar entre 1 y 50.",
                "code": "INVALID_VOCABULARY_PAGINATION"
            })),
        ));
    }
    let offset = page.saturating_sub(1).saturating_mul(page_size);
    let selected_level = query.level.unwrap_or(user_level);
    let mut request = tonic::Request::new(ListVocabularyWordsRequest {
        level: selected_level,
        category: query.category.unwrap_or_default(),
        limit: page_size,
        offset,
        user_id,
        track: query.track.unwrap_or_default(),
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
            let total_pages = if total == 0 { 0 } else { (total + page_size - 1) / page_size };
            Ok(Json(VocabularyListDto { items, total, page, page_size, total_pages }))
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


#[derive(Deserialize, Default)]
pub struct ComprehensionResourcesQuery {
    pub page: Option<i32>,
    pub page_size: Option<i32>,
    pub track: Option<String>,
    pub cefr_level: Option<String>,
    pub skill: Option<String>,
}

#[derive(Serialize)]
pub struct ComprehensionResourceDto {
    pub id: String,
    pub track: String,
    pub cefr_level: String,
    pub skill: String,
    pub title: String,
    pub topic: String,
    pub content: String,
    pub word_count: i32,
    pub sentence_count: i32,
    pub estimated_minutes: i32,
    pub comprehension_focus: String,
    pub lexical_tags: Vec<String>,
    pub transcript_available: bool,
    pub audio_url: String,
    pub audio_status: String,
    pub questions: serde_json::Value,
}

#[derive(Serialize)]
pub struct ComprehensionResourceListDto {
    pub items: Vec<ComprehensionResourceDto>,
    pub total: i32,
    pub page: i32,
    pub page_size: i32,
    pub total_pages: i32,
}

/// GET /api/v1/content/comprehension-resources
/// Only published resources are returned by the content service. Listening
/// transcripts remain hidden from the student reader until the activity engine
/// can verify an answer and explicitly unlock them.
pub async fn comprehension_resources_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<ComprehensionResourcesQuery>,
) -> Result<Json<ComprehensionResourceListDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let page = query.page.unwrap_or(1);
    let page_size = query.page_size.unwrap_or(12);
    if page <= 0 || !(1..=50).contains(&page_size) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "La página debe ser positiva y page_size debe estar entre 1 y 50.",
                "code": "INVALID_COMPREHENSION_PAGINATION"
            })),
        ));
    }

    let mut request = tonic::Request::new(ListComprehensionResourcesRequest {
        user_id,
        page,
        page_size,
        track: query.track.unwrap_or_default(),
        cefr_level: query.cefr_level.unwrap_or_default(),
        skill: query.skill.unwrap_or_default(),
    });
    attach_bearer_metadata(&headers, &mut request)?;

    let mut client = state.content_client.clone();
    let response = client.list_comprehension_resources(request).await.map_err(|error| {
        let (status, code, message) = match error.code() {
            tonic::Code::Unauthenticated => (StatusCode::UNAUTHORIZED, "CONTENT_UNAUTHENTICATED", "Se requiere una sesión válida."),
            tonic::Code::InvalidArgument => (StatusCode::BAD_REQUEST, "CONTENT_INVALID_QUERY", "Los filtros de lectura/escucha no son válidos."),
            tonic::Code::DeadlineExceeded | tonic::Code::Unavailable => (StatusCode::SERVICE_UNAVAILABLE, "CONTENT_UNAVAILABLE", "El catálogo de comprensión no está disponible temporalmente."),
            _ => (StatusCode::BAD_GATEWAY, "CONTENT_UPSTREAM_ERROR", "No se pudieron consultar los recursos de comprensión."),
        };
        (status, Json(serde_json::json!({ "message": message, "code": code })))
    })?.into_inner();

    let items = response.items.into_iter().map(|resource| {
        let questions = serde_json::from_str::<serde_json::Value>(&resource.questions_json)
            .map_err(|_| (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({
                    "message": "El servicio de contenido devolvió preguntas con formato inválido.",
                    "code": "CONTENT_INVALID_QUESTIONS"
                })),
            ))?;
        Ok(ComprehensionResourceDto {
            id: resource.id,
            track: resource.track,
            cefr_level: resource.cefr_level,
            skill: resource.skill,
            title: resource.title,
            topic: resource.topic,
            content: if resource.skill == "listening" { String::new() } else { resource.content },
            word_count: resource.word_count,
            sentence_count: resource.sentence_count,
            estimated_minutes: resource.estimated_minutes,
            comprehension_focus: resource.comprehension_focus,
            lexical_tags: resource.lexical_tags,
            transcript_available: false,
            audio_url: resource.audio_url,
            audio_status: resource.audio_status,
            questions,
        })
    }).collect::<Result<Vec<_>, (StatusCode, Json<serde_json::Value>)>>()?;

    Ok(Json(ComprehensionResourceListDto {
        items,
        total: response.total,
        page: response.page,
        page_size: response.page_size,
        total_pages: response.total_pages,
    }))
}

/// POST /api/v1/content/speech — TTS delegado al microservicio de audio.
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
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default()
        .to_string();
    if text.trim().is_empty() || text.chars().count() > 1_000 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "El texto debe contener entre 1 y 1000 caracteres.",
                "code": "INVALID_SPEECH_TEXT"
            })),
        ));
    }

    let voice = match body.get("voice") {
        None => "",
        Some(value) => value.as_str().ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "message": "La voz solicitada debe ser una cadena válida.",
                    "code": "INVALID_SPEECH_VOICE"
                })),
            )
        })?,
    };
    if !voice.is_empty()
        && !matches!(
            voice,
            "Lupe"
                | "Mia"
                | "Lucia"
                | "Enrique"
                | "Conchita"
                | "Matthew"
                | "Joanna"
                | "Ruth"
                | "Stephen"
        )
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "La voz solicitada no es válida.",
                "code": "INVALID_SPEECH_VOICE"
            })),
        ));
    }

    let rate = match body.get("rate") {
        None => "",
        Some(value) => value.as_str().ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "message": "La velocidad de voz debe ser una cadena válida.",
                    "code": "INVALID_SPEECH_RATE"
                })),
            )
        })?,
    };
    if !rate.is_empty() && !matches!(rate, "x-slow" | "slow" | "medium" | "fast") {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "La velocidad de voz no es válida.",
                "code": "INVALID_SPEECH_RATE"
            })),
        ));
    }

    let mut request = tonic::Request::new(SynthesizeRequest {
        text: text.clone(),
        voice: voice.to_string(),
        rate: rate.to_string(),
    });
    if let Some(correlation_id) = headers
        .get("x-correlation-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| tonic::metadata::MetadataValue::try_from(value).ok())
    {
        request
            .metadata_mut()
            .insert("x-correlation-id", correlation_id);
    }

    match state.phonetic_audio_client.synthesize_audio(request).await {
        Ok(response) => {
            let audio = response.into_inner();
            tracing::info!(
                provider = %audio.provider,
                model = %audio.model,
                playback_rate = audio.playback_rate,
                "BFF speech request completed"
            );
            Ok(Json(serde_json::json!({
                "audio_base64": audio.audio_base64,
                "format": audio.format,
                "voice": audio.voice,
                "text": audio.text,
                "provider": audio.provider,
                "model": audio.model,
                "playback_rate": audio.playback_rate
            })))
        }
        Err(error) => {
            let (status, code, message) = match error.code() {
                tonic::Code::InvalidArgument => (
                    StatusCode::BAD_REQUEST,
                    "INVALID_SPEECH_REQUEST",
                    "La solicitud de síntesis de voz no es válida.",
                ),
                tonic::Code::ResourceExhausted => (
                    StatusCode::TOO_MANY_REQUESTS,
                    "TTS_PROVIDER_RATE_LIMITED",
                    "El proveedor de voz alcanzó su límite temporal.",
                ),
                tonic::Code::DeadlineExceeded => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "TTS_PROVIDER_TIMEOUT",
                    "El proveedor de voz agotó el tiempo de espera.",
                ),
                tonic::Code::Unavailable => (
                    StatusCode::SERVICE_UNAVAILABLE,
                    "TTS_PROVIDER_UNAVAILABLE",
                    "El proveedor de síntesis de voz no está disponible.",
                ),
                tonic::Code::Unknown | tonic::Code::DataLoss | tonic::Code::Internal => (
                    StatusCode::BAD_GATEWAY,
                    "TTS_UPSTREAM_ERROR",
                    "No se pudo completar la síntesis de voz.",
                ),
                _ => (
                    StatusCode::BAD_GATEWAY,
                    "TTS_UPSTREAM_ERROR",
                    "No se pudo completar la síntesis de voz.",
                ),
            };
            tracing::warn!(
                grpc_code = ?error.code(),
                "BFF could not complete the gRPC speech request"
            );
            Err((
                status,
                Json(serde_json::json!({
                    "message": message,
                    "code": code
                })),
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
