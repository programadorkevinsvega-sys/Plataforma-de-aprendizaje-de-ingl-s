use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use proto::ai_evaluator::{
    BeginLessonActivityAttemptRequest, CommitLessonActivityAttemptRequest,
    EvaluateLearningActivityRequest, GetLessonSessionRequest, StartLessonSessionRequest,
};
use proto::gamification::RecordLessonCompletionRequest;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::request_limiter::allow_request;
use crate::srs_handler::{attach_bearer_metadata, validate_token_from_headers};
use crate::AppState;
use std::time::Duration;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct StartLessonSessionBody {
    pub idempotency_key: String,
}

#[derive(Serialize)]
pub struct LessonSessionDto {
    pub session_id: String,
    pub lesson_id: String,
    pub lesson_title: String,
    pub course_version_id: String,
    pub status: String,
    pub current_activity_position: i32,
    pub total_activities: i32,
    pub active_duration_ms: i64,
    pub activity: Option<Value>,
    pub last_result: Option<Value>,
    pub completed_at: Option<String>,
    pub remaining_attempts: i32,
}

#[derive(Serialize)]
pub struct StartLessonSessionDto {
    pub session: LessonSessionDto,
    pub resumed_existing: bool,
}

#[derive(Serialize)]
pub struct SubmitLessonActivityDto {
    pub session: LessonSessionDto,
    pub result: Value,
    pub idempotent_replay: bool,
    pub reward_pending: bool,
}

#[derive(Serialize)]
struct SessionErrorDto {
    code: &'static str,
    message: &'static str,
}

fn rate_limit_error() -> (StatusCode, Json<SessionErrorDto>) {
    (
        StatusCode::TOO_MANY_REQUESTS,
        Json(SessionErrorDto {
            code: "LEARNING_SESSION_RATE_LIMIT",
            message: "Has enviado demasiadas solicitudes de aprendizaje. Espera un momento y vuelve a intentarlo.",
        }),
    )
}

fn session_error(error: tonic::Status, operation: &'static str) -> (StatusCode, Json<SessionErrorDto>) {
    let (status, code, message) = match error.code() {
        tonic::Code::InvalidArgument => (
            StatusCode::BAD_REQUEST,
            "LEARNING_SESSION_INVALID",
            "Los datos enviados para la sesión no son válidos.",
        ),
        tonic::Code::Unauthenticated => (
            StatusCode::UNAUTHORIZED,
            "AUTHENTICATION_REQUIRED",
            "Debes iniciar sesión para continuar.",
        ),
        tonic::Code::PermissionDenied => (
            StatusCode::FORBIDDEN,
            "LEARNING_SESSION_FORBIDDEN",
            "No tienes permiso para acceder a esta sesión.",
        ),
        tonic::Code::NotFound => (
            StatusCode::NOT_FOUND,
            "LEARNING_SESSION_NOT_FOUND",
            "No encontramos la sesión o la lección solicitada.",
        ),
        tonic::Code::AlreadyExists | tonic::Code::Aborted => (
            StatusCode::CONFLICT,
            "LEARNING_SESSION_CONFLICT",
            "La solicitud entra en conflicto con otro envío. Actualiza la sesión e inténtalo de nuevo.",
        ),
        tonic::Code::FailedPrecondition => (
            StatusCode::CONFLICT,
            "LEARNING_SESSION_PRECONDITION",
            "La sesión no puede continuar con el estado o los requisitos actuales.",
        ),
        tonic::Code::ResourceExhausted => (
            StatusCode::TOO_MANY_REQUESTS,
            "LEARNING_SESSION_LIMIT",
            "Se alcanzó un límite permitido para esta actividad.",
        ),
        tonic::Code::DeadlineExceeded => (
            StatusCode::REQUEST_TIMEOUT,
            "LEARNING_SESSION_TIMEOUT",
            "Se agotó el tiempo permitido para esta actividad.",
        ),
        tonic::Code::Unavailable => (
            StatusCode::SERVICE_UNAVAILABLE,
            "LEARNING_SESSION_UNAVAILABLE",
            "El servicio de aprendizaje no está disponible temporalmente.",
        ),
        tonic::Code::DataLoss => (
            StatusCode::BAD_GATEWAY,
            "LEARNING_SESSION_DATA_INVALID",
            "El contenido publicado no superó una comprobación de integridad.",
        ),
        _ => (
            StatusCode::BAD_GATEWAY,
            "LEARNING_SESSION_UPSTREAM_ERROR",
            "No se pudo completar la operación de aprendizaje.",
        ),
    };
    tracing::warn!(operation, grpc_code = ?error.code(), "Learning session request failed");
    (
        status,
        Json(SessionErrorDto {
            code,
            message,
        }),
    )
}

fn parse_json_field(raw: &str, field: &'static str) -> Result<Option<Value>, (StatusCode, Json<SessionErrorDto>)> {
    if raw.is_empty() {
        return Ok(None);
    }
    let value: Value = serde_json::from_str(raw).map_err(|error| {
        tracing::error!(%error, field, "Internal learning session JSON could not be decoded");
        (
            StatusCode::BAD_GATEWAY,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INVALID_RESPONSE",
                message: "El servicio de aprendizaje devolvió una respuesta inválida.",
            }),
        )
    })?;
    Ok(Some(value))
}

fn session_dto(
    snapshot: proto::ai_evaluator::LessonSessionSnapshot,
) -> Result<LessonSessionDto, (StatusCode, Json<SessionErrorDto>)> {
    let activity = parse_json_field(&snapshot.student_activity_json, "student_activity")?;
    let last_result = parse_json_field(&snapshot.last_result_json, "last_result")?;
    // activity_definition_json is intentionally not copied into this HTTP DTO.
    Ok(LessonSessionDto {
        session_id: snapshot.session_id,
        lesson_id: snapshot.lesson_id,
        lesson_title: snapshot.lesson_title,
        course_version_id: snapshot.course_version_id,
        status: snapshot.status,
        current_activity_position: snapshot.current_activity_position,
        total_activities: snapshot.total_activities,
        active_duration_ms: snapshot.active_duration_ms,
        activity,
        last_result,
        completed_at: if snapshot.completed_at.is_empty() {
            None
        } else {
            Some(snapshot.completed_at)
        },
        remaining_attempts: snapshot.remaining_attempts,
    })
}

async fn record_lesson_reward(
    state: &mut AppState,
    headers: &HeaderMap,
    user_id: &str,
    session_id: &str,
    lesson_id: &str,
) -> bool {
    let mut request = tonic::Request::new(RecordLessonCompletionRequest {
        user_id: user_id.to_string(),
        session_id: session_id.to_string(),
        lesson_id: lesson_id.to_string(),
    });
    if let Err((_, _)) = attach_bearer_metadata(headers, &mut request) {
        return true;
    }
    let mut client = state.gamification_client.clone();
    match client.record_lesson_completion(request).await {
        Ok(_) => false,
        Err(error) => {
            tracing::warn!(
                user_id,
                session_id,
                lesson_id,
                grpc_code = ?error.code(),
                "Lesson completed but reward delivery is pending; it will be retried on session recovery"
            );
            true
        }
    }
}

/// POST /api/v1/curriculum/lessons/:lesson_id/sessions
pub async fn start_lesson_session_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Path(lesson_id): Path<String>,
    Json(body): Json<StartLessonSessionBody>,
) -> Result<Json<StartLessonSessionDto>, (StatusCode, Json<SessionErrorDto>)> {
    if lesson_id.trim().is_empty()
        || lesson_id.len() > 36
        || body.idempotency_key.trim().is_empty()
        || body.idempotency_key.len() > 36
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INPUT_INVALID",
                message: "La lección y la clave de idempotencia deben ser UUID válidos.",
            }),
        ));
    }

    let user_id = validate_token_from_headers(&headers, &mut state)
        .await
        .map_err(|(status, _)| {
            (
                status,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "Debes iniciar sesión para continuar.",
                }),
            )
        })?;
    if !allow_request(&user_id, "lesson-session-start", 10, Duration::from_secs(60)) {
        return Err(rate_limit_error());
    }
    let mut request = tonic::Request::new(StartLessonSessionRequest {
        user_id,
        lesson_id,
        idempotency_key: body.idempotency_key,
    });
    attach_bearer_metadata(&headers, &mut request)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "La sesión de autenticación no es válida.",
                }),
            )
        })?;

    let mut client = state.ai_client.clone();
    let response = client
        .start_lesson_session(request)
        .await
        .map_err(|error| session_error(error, "start_lesson_session"))?
        .into_inner();
    let snapshot = response.session.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INVALID_RESPONSE",
                message: "El servicio de sesiones no devolvió una sesión válida.",
            }),
        )
    })?;
    Ok(Json(StartLessonSessionDto {
        session: session_dto(snapshot)?,
        resumed_existing: response.resumed_existing,
    }))
}

/// GET /api/v1/learning/sessions/:session_id
pub async fn get_lesson_session_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
) -> Result<Json<SubmitLessonActivityDto>, (StatusCode, Json<SessionErrorDto>)> {
    if session_id.trim().is_empty() || session_id.len() > 36 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INPUT_INVALID",
                message: "El identificador de sesión debe ser un UUID válido.",
            }),
        ));
    }
    let user_id = validate_token_from_headers(&headers, &mut state)
        .await
        .map_err(|(status, _)| {
            (
                status,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "Debes iniciar sesión para continuar.",
                }),
            )
        })?;
    if !allow_request(&user_id, "lesson-session-read-recover", 30, Duration::from_secs(60)) {
        return Err(rate_limit_error());
    }
    let mut request = tonic::Request::new(GetLessonSessionRequest {
        user_id: user_id.clone(),
        session_id: session_id.clone(),
    });
    attach_bearer_metadata(&headers, &mut request)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "La sesión de autenticación no es válida.",
                }),
            )
        })?;
    let mut client = state.ai_client.clone();
    let response = client
        .get_lesson_session(request)
        .await
        .map_err(|error| session_error(error, "get_lesson_session"))?
        .into_inner();
    let mut snapshot = response.session.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INVALID_RESPONSE",
                message: "El servicio de sesiones no devolvió una sesión válida.",
            }),
        )
    })?;
    let mut recovered_result: Option<Value> = None;
    if !snapshot.pending_reservation_id.is_empty() {
        if snapshot.activity_definition_json.is_empty() || snapshot.pending_submission_json.is_empty() {
            return Err((
                StatusCode::BAD_GATEWAY,
                Json(SessionErrorDto {
                    code: "LEARNING_SESSION_RECOVERY_INVALID",
                    message: "El intento reservado no contiene la evidencia necesaria para recuperarlo.",
                }),
            ));
        }
        let mut evaluation_request = tonic::Request::new(EvaluateLearningActivityRequest {
            user_id: user_id.clone(),
            activity_definition_json: snapshot.activity_definition_json.clone(),
            submission_json: snapshot.pending_submission_json.clone(),
        });
        attach_bearer_metadata(&headers, &mut evaluation_request).map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "La sesión de autenticación no es válida.",
                }),
            )
        })?;
        let mut evaluator = state.ai_client.clone();
        evaluator
            .evaluate_learning_activity(evaluation_request)
            .await
            .map_err(|error| session_error(error, "recover_pending_lesson_evaluation"))?;

        let mut commit_request = tonic::Request::new(CommitLessonActivityAttemptRequest {
            user_id: user_id.clone(),
            session_id: session_id.clone(),
            reservation_id: snapshot.pending_reservation_id.clone(),
        });
        attach_bearer_metadata(&headers, &mut commit_request).map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "La sesión de autenticación no es válida.",
                }),
            )
        })?;
        let mut client = state.ai_client.clone();
        let committed = client
            .commit_lesson_activity_attempt(commit_request)
            .await
            .map_err(|error| session_error(error, "recover_pending_lesson_commit"))?
            .into_inner();
        recovered_result = Some(serde_json::from_str(&committed.result_json).map_err(|error| {
            tracing::error!(%error, "Recovered lesson result is not valid JSON");
            (
                StatusCode::BAD_GATEWAY,
                Json(SessionErrorDto {
                    code: "LEARNING_SESSION_INVALID_RESULT",
                    message: "El servicio de evaluación devolvió un resultado inválido.",
                }),
            )
        })?);
        snapshot = committed.session.ok_or_else(|| {
            (
                StatusCode::BAD_GATEWAY,
                Json(SessionErrorDto {
                    code: "LEARNING_SESSION_INVALID_RESPONSE",
                    message: "El servicio de sesiones no devolvió el estado recuperado.",
                }),
            )
        })?;
    }

    let lesson_id = snapshot.lesson_id.clone();
    let session_status = snapshot.status.clone();
    let recovered_during_get = recovered_result.is_some();
    let last_result = match recovered_result {
        Some(result) => result,
        None => parse_json_field(&snapshot.last_result_json, "last_result")?
            .unwrap_or(Value::Null),
    };
    let reward_pending = if session_status == "completed" {
        record_lesson_reward(
            &mut state,
            &headers,
            &user_id,
            &session_id,
            &lesson_id,
        )
        .await
    } else {
        false
    };
    Ok(Json(SubmitLessonActivityDto {
        session: session_dto(snapshot)?,
        result: last_result,
        idempotent_replay: recovered_during_get,
        reward_pending,
    }))
}

/// POST /api/v1/learning/sessions/:session_id/answers
pub async fn submit_lesson_activity_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Path(session_id): Path<String>,
    Json(submission): Json<Value>,
) -> Result<Json<SubmitLessonActivityDto>, (StatusCode, Json<SessionErrorDto>)> {
    if session_id.trim().is_empty() || session_id.len() > 36 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INPUT_INVALID",
                message: "El identificador de sesión debe ser un UUID válido.",
            }),
        ));
    }
    let submission_json = serde_json::to_string(&submission)
        .map_err(|_| {
            (
                StatusCode::BAD_REQUEST,
                Json(SessionErrorDto {
                    code: "LEARNING_SESSION_SUBMISSION_INVALID",
                    message: "No se pudo interpretar la respuesta enviada.",
                }),
            )
        })?;
    if submission_json.len() > 256 * 1024 {
        return Err((
            StatusCode::PAYLOAD_TOO_LARGE,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_SUBMISSION_TOO_LARGE",
                message: "La respuesta supera el tamaño permitido.",
            }),
        ));
    }
    let user_id = validate_token_from_headers(&headers, &mut state)
        .await
        .map_err(|(status, _)| {
            (
                status,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "Debes iniciar sesión para continuar.",
                }),
            )
        })?;
    if !allow_request(&user_id, "lesson-session-submit", 20, Duration::from_secs(60)) {
        return Err(rate_limit_error());
    }

    // Step 1: reserve the attempt against the current published activity.
    let mut begin_request = tonic::Request::new(BeginLessonActivityAttemptRequest {
        user_id: user_id.clone(),
        session_id: session_id.clone(),
        submission_json: submission_json.clone(),
    });
    attach_bearer_metadata(&headers, &mut begin_request)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "La sesión de autenticación no es válida.",
                }),
            )
        })?;
    let mut client = state.ai_client.clone();
    let reservation = client
        .begin_lesson_activity_attempt(begin_request)
        .await
        .map_err(|error| session_error(error, "begin_lesson_activity_attempt"))?
        .into_inner();

    let mut idempotent_replay = reservation.idempotent_replay;
    // Step 2: evaluate only the backend's private, immutable activity definition.
    // If a previous request already finished assessment, reuse that stored result.
    if reservation.existing_result_json.is_empty() {
        let mut evaluation_request = tonic::Request::new(EvaluateLearningActivityRequest {
            user_id: user_id.clone(),
            activity_definition_json: reservation.activity_definition_json,
            submission_json,
        });
        attach_bearer_metadata(&headers, &mut evaluation_request)
            .map_err(|_| {
                (
                    StatusCode::UNAUTHORIZED,
                    Json(SessionErrorDto {
                        code: "AUTHENTICATION_REQUIRED",
                        message: "La sesión de autenticación no es válida.",
                    }),
                )
            })?;
        let mut evaluator = state.ai_client.clone();
        let evaluation = evaluator
            .evaluate_learning_activity(evaluation_request)
            .await
            .map_err(|error| session_error(error, "evaluate_learning_activity"))?
            .into_inner();
        idempotent_replay |= evaluation.idempotent_replay;
    }

    // Step 3: atomically attach the persisted assessment result to the reservation,
    // record objective evidence, and advance (or complete) the lesson session.
    let mut commit_request = tonic::Request::new(CommitLessonActivityAttemptRequest {
        user_id: user_id.clone(),
        session_id: session_id.clone(),
        reservation_id: reservation.reservation_id,
    });
    attach_bearer_metadata(&headers, &mut commit_request)
        .map_err(|_| {
            (
                StatusCode::UNAUTHORIZED,
                Json(SessionErrorDto {
                    code: "AUTHENTICATION_REQUIRED",
                    message: "La sesión de autenticación no es válida.",
                }),
            )
        })?;
    let mut client = state.ai_client.clone();
    let committed = client
        .commit_lesson_activity_attempt(commit_request)
        .await
        .map_err(|error| session_error(error, "commit_lesson_activity_attempt"))?
        .into_inner();
    idempotent_replay |= committed.idempotent_replay;
    let result: Value = serde_json::from_str(&committed.result_json).map_err(|error| {
        tracing::error!(%error, "Committed lesson result is not valid JSON");
        (
            StatusCode::BAD_GATEWAY,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INVALID_RESULT",
                message: "El servicio de evaluación devolvió un resultado inválido.",
            }),
        )
    })?;
    let snapshot = committed.session.ok_or_else(|| {
        (
            StatusCode::BAD_GATEWAY,
            Json(SessionErrorDto {
                code: "LEARNING_SESSION_INVALID_RESPONSE",
                message: "El servicio de sesiones no devolvió el estado actualizado.",
            }),
        )
    })?;
    let reward_pending = if snapshot.status == "completed" {
        record_lesson_reward(
            &mut state,
            &headers,
            &user_id,
            &session_id,
            &snapshot.lesson_id,
        )
        .await
    } else {
        false
    };
    Ok(Json(SubmitLessonActivityDto {
        session: session_dto(snapshot)?,
        result,
        idempotent_replay,
        reward_pending,
    }))
}
