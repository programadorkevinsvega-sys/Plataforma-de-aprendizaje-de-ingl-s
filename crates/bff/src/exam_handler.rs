use axum::{
    extract::{Json, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use proto::ai_evaluator::{EvaluateExamAnswerRequest, GenerateTargetedDrillRequest};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Mutex, OnceLock},
    time::{Instant, SystemTime, UNIX_EPOCH},
};
use uuid::Uuid;

use crate::AppState;
use crate::srs_handler::{attach_bearer_metadata, validate_token_from_headers};

#[derive(Serialize)]
pub struct InterviewQuestionDto {
    pub id: String,
    pub question: String,
    pub context: String,
    pub difficulty: String,
    pub category: String,
}

#[derive(Serialize)]
pub struct MetricScoresDto {
    pub listening: f32,
    pub pronunciation: f32,
    pub fluency: f32,
    pub vocabulary: f32,
    pub grammar: f32,
    pub conversation: f32,
    pub total_score: f32,
    pub passed: bool,
}

#[derive(Serialize)]
pub struct ExamResultDto {
    pub result: MetricScoresDto,
    pub detected_weaknesses: Vec<WeaknessDto>,
}

#[derive(Serialize)]
pub struct WeaknessDto {
    pub skill: String,
    pub score: f32,
    pub tip: String,
}

#[derive(Serialize)]
pub struct DrillDto {
    pub drill_id: String,
    pub duration_minutes: i32,
    pub exercises: Vec<DrillExerciseDto>,
}

#[derive(Serialize)]
pub struct DrillExerciseDto {
    pub title: String,
    pub english_text: String,
    pub spanish_phonetic: String,
    pub target_skill: String,
}

#[derive(Deserialize)]
pub struct EvaluateAnswerBody {
    pub question_id: String,
    pub question: String,
    pub answer: String,
    pub audio_base64: Option<String>,
}

const MAX_QUESTION_ID_CHARS: usize = 128;
const MAX_QUESTION_CHARS: usize = 2_000;
const MAX_ANSWER_CHARS: usize = 10_000;
const MAX_AUDIO_BASE64_CHARS: usize = 1_000_000;

fn validate_evaluation_input(body: &EvaluateAnswerBody) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    if body.question_id.trim().is_empty()
        || body.question_id.chars().count() > MAX_QUESTION_ID_CHARS
        || body.question.trim().is_empty()
        || body.question.chars().count() > MAX_QUESTION_CHARS
        || body.answer.chars().count() > MAX_ANSWER_CHARS
        || body.answer.split_whitespace().count() < 12
        || body.audio_base64.as_ref().is_some_and(|audio| audio.len() > MAX_AUDIO_BASE64_CHARS)
        || body.audio_base64.as_ref().is_some_and(|audio| !audio.is_empty())
    {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "message": "La respuesta debe tener al menos 12 palabras, respetar los límites permitidos y no incluir audio sin transcribir.",
                "code": "INVALID_EVALUATION_INPUT"
            })),
        ));
    }
    Ok(())
}

/// POST /api/v1/exam/questions/next — Siguiente pregunta de entrevista desde PostgreSQL
pub async fn next_question_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<InterviewQuestionDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    let mut profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
        user_id: user_id.clone(),
    });
    attach_bearer_metadata(&headers, &mut profile_req)?;
    let user_level = state.auth_client.get_user_profile(profile_req).await
        .map_err(|_| (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "message": "No se pudo recuperar el perfil autenticado.",
                "code": "PROFILE_UNAVAILABLE"
            })),
        ))?
        .into_inner()
        .current_level;

    let req = tonic::Request::new(proto::content::GetRandomInterviewQuestionRequest {
        category: "".to_string(),
        level: user_level,
    });

    match state.content_client.get_random_interview_question(req).await {
        Ok(res) => {
            let q = res.into_inner();
            Ok(Json(InterviewQuestionDto {
                id: q.id,
                question: q.question.clone(),
                context: format!("Contexto: {} — Nivel {}", q.category, q.difficulty),
                difficulty: q.difficulty,
                category: q.category,
            }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "message": "No se pudo obtener una pregunta de entrevista.", "code": "QUESTION_UNAVAILABLE" })),
        )),
    }
}

/// POST /api/v1/exam/evaluate — Evaluar respuesta del usuario
pub async fn evaluate_answer_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<EvaluateAnswerBody>,
) -> Result<Json<ExamResultDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    if !crate::request_limiter::allow_request(
        &user_id,
        "ai-evaluate",
        5,
        std::time::Duration::from_secs(60),
    ) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "message": "Se alcanzó el límite temporal de evaluaciones IA.",
                "code": "AI_EVALUATION_RATE_LIMITED"
            })),
        ));
    }
    validate_evaluation_input(&body)?;

    let mut profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
        user_id: user_id.clone(),
    });
    attach_bearer_metadata(&headers, &mut profile_req)?;
    let user_level = state.auth_client.get_user_profile(profile_req).await
        .map_err(|_| (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({
                "message": "No se pudo recuperar el perfil autenticado.",
                "code": "PROFILE_UNAVAILABLE"
            })),
        ))?
        .into_inner()
        .current_level;

    // El audio se procesa en el WebSocket de transcripción. Este endpoint solo
    // evalúa el texto transcrito; no convierte un payload de audio en respuesta.
    let response_text = body.answer;

    let mut request = tonic::Request::new(EvaluateExamAnswerRequest {
        user_id,
        question_id: body.question_id,
        user_text_response: response_text,
        target_level: user_level,
    });
    attach_bearer_metadata(&headers, &mut request)?;

    match state.ai_client.evaluate_exam_answer(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            let weaknesses = inner.detected_weaknesses.into_iter().map(|w| WeaknessDto {
                skill: w.skill,
                score: w.score,
                tip: w.tip,
            }).collect();

            Ok(Json(ExamResultDto {
                result: MetricScoresDto {
                    listening: inner.score_listening,
                    pronunciation: inner.score_pronunciation,
                    fluency: inner.score_fluency,
                    vocabulary: inner.score_vocabulary,
                    grammar: inner.score_grammar,
                    conversation: inner.score_conversation,
                    total_score: inner.total_score,
                    passed: inner.passed,
                },
                detected_weaknesses: weaknesses,
            }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "message": "El servicio de evaluación no está disponible.", "code": "EVAL_UNAVAILABLE" })),
        )),
    }
}

/// GET /api/v1/exam/results/:id/drill — Generar drill de refuerzo
pub async fn get_drill_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path(_result_id): axum::extract::Path<String>,
) -> Result<Json<DrillDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    if !crate::request_limiter::allow_request(
        &user_id,
        "ai-drill",
        5,
        std::time::Duration::from_secs(60),
    ) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "message": "Se alcanzó el límite temporal de ejercicios IA.",
                "code": "AI_DRILL_RATE_LIMITED"
            })),
        ));
    }

    let mut request = tonic::Request::new(GenerateTargetedDrillRequest {
        user_id,
        weak_skills: vec!["Pronunciación".to_string(), "Fluidez".to_string()],
    });
    attach_bearer_metadata(&headers, &mut request)?;

    match state.ai_client.generate_targeted_drill(request).await {
        Ok(res) => {
            let inner = res.into_inner();
            let exercises = inner.exercises.into_iter().map(|e| DrillExerciseDto {
                title: e.title,
                english_text: e.english_text,
                spanish_phonetic: e.spanish_phonetic,
                target_skill: e.target_skill,
            }).collect();

            Ok(Json(DrillDto {
                drill_id: inner.drill_id,
                duration_minutes: inner.duration_minutes,
                exercises,
            }))
        }
        Err(_error) => Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(serde_json::json!({ "message": "El servicio de ejercicios no está disponible.", "code": "DRILL_UNAVAILABLE" })),
        )),
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct TranscribeTicketClaims {
    sub: String,
    purpose: String,
    jti: String,
    exp: usize,
}

#[derive(Debug, Serialize)]
pub struct TranscribeTicketDto {
    pub ticket: String,
    pub expires_in_seconds: u64,
}

const TRANSCRIBE_TICKET_TTL_SECONDS: usize = 60;
const TRANSCRIBE_TICKET_MAX_PER_MINUTE: usize = 5;
const TRANSCRIBE_MAX_DURATION_SECONDS: u64 = 300;
const TRANSCRIBE_MAX_AUDIO_BYTES: usize = 9 * 1024 * 1024;
const TRANSCRIBE_MAX_CHUNK_BYTES: usize = 8192;
const TRANSCRIBE_WS_PROTOCOL: &str = "devfluency.transcribe.v1";
const TRANSCRIBE_TICKET_PROTOCOL_PREFIX: &str = "ticket.";

static TICKET_REQUESTS: OnceLock<Mutex<HashMap<String, VecDeque<Instant>>>> = OnceLock::new();
static USED_TRANSCRIBE_TICKETS: OnceLock<Mutex<HashMap<String, usize>>> = OnceLock::new();

fn unix_time_seconds() -> usize {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as usize)
        .unwrap_or(0)
}

fn configured_jwt_secret() -> Result<String, &'static str> {
    let secret = std::env::var("JWT_SECRET")
        .map_err(|_| "La autenticación no está configurada")?;
    if secret.trim().is_empty() || secret.as_bytes().len() < 32 {
        return Err("La autenticación no está configurada");
    }
    Ok(secret)
}

fn encode_transcribe_ticket(
    subject: &str,
    jti: &str,
    expires_at: usize,
    secret: &str,
) -> Result<String, jsonwebtoken::errors::Error> {
    let claims = TranscribeTicketClaims {
        sub: subject.to_owned(),
        purpose: "transcribe".to_owned(),
        jti: jti.to_owned(),
        exp: expires_at,
    };
    encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

fn decode_transcribe_ticket(
    token: &str,
    secret: &str,
) -> Result<TranscribeTicketClaims, ()> {
    if secret.trim().is_empty() || secret.as_bytes().len() < 32 {
        return Err(());
    }
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.required_spec_claims.insert("sub".to_string());
    decode::<TranscribeTicketClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|_| ())
}

fn allow_ticket_request(user_id: &str) -> bool {
    let requests = TICKET_REQUESTS.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut requests) = requests.lock() else {
        return false;
    };
    let now = Instant::now();
    requests.retain(|_, times| {
        while times.front().is_some_and(|time| now.duration_since(*time).as_secs() >= 60) {
            times.pop_front();
        }
        !times.is_empty()
    });
    let times = requests.entry(user_id.to_owned()).or_default();
    if times.len() >= TRANSCRIBE_TICKET_MAX_PER_MINUTE {
        return false;
    }
    times.push_back(now);
    true
}

fn consume_transcribe_ticket(jti: &str, expires_at: usize) -> bool {
    let now = unix_time_seconds();
    if expires_at <= now {
        return false;
    }
    let tickets = USED_TRANSCRIBE_TICKETS.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut tickets) = tickets.lock() else {
        return false;
    };
    tickets.retain(|_, expires| *expires > now);
    if tickets.contains_key(jti) {
        return false;
    }
    tickets.insert(jti.to_owned(), expires_at);
    true
}

fn websocket_origin_allowed(origin: &str, configured_origins: Option<&str>) -> bool {
    let Some(configured_origins) = configured_origins.filter(|value| !value.trim().is_empty()) else {
        return origin == "http://localhost:3000";
    };
    configured_origins
        .split(',')
        .map(str::trim)
        .any(|allowed| !allowed.is_empty() && allowed == origin)
}

/// POST /api/v1/exam/transcribe/ticket
/// Crea un ticket de corta vida, ligado exclusivamente a la apertura del stream de transcripción.
pub async fn create_transcribe_ticket_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<TranscribeTicketDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await?;
    if !allow_ticket_request(&user_id) {
        return Err((
            StatusCode::TOO_MANY_REQUESTS,
            Json(serde_json::json!({
                "message": "Demasiadas solicitudes de transcripción. Intenta más tarde.",
                "code": "TRANSCRIBE_RATE_LIMITED"
            })),
        ));
    }

    let secret = configured_jwt_secret().map_err(|_| (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({
            "message": "La autenticación no está configurada.",
            "code": "AUTH_CONFIGURATION_UNAVAILABLE"
        })),
    ))?;
    let expires_at = unix_time_seconds() + TRANSCRIBE_TICKET_TTL_SECONDS;
    let jti = Uuid::new_v4().to_string();
    let ticket = encode_transcribe_ticket(&user_id, &jti, expires_at, &secret).map_err(|_| (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({
            "message": "No se pudo autorizar la transcripción.",
            "code": "TRANSCRIBE_TICKET_ERROR"
        })),
    ))?;

    Ok(Json(TranscribeTicketDto {
        ticket,
        expires_in_seconds: TRANSCRIBE_TICKET_TTL_SECONDS as u64,
    }))
}

/// GET /api/v1/exam/transcribe/ws — WebSocket de transcripción en tiempo real
/// Protocolo:
///   Cliente → Servidor: frames Binary con chunks PCM-16 de 640 bytes (20ms a 16kHz)
///   Servidor → Cliente: frames Text con JSON {"partial": "...", "is_final": bool}
///   Cliente → Servidor: frame Text "stop" para cerrar la sesión
pub async fn transcribe_ws_handler(
    ws: WebSocketUpgrade,
    headers: HeaderMap,
) -> Result<Response, (StatusCode, Json<serde_json::Value>)> {
    let origin = headers
        .get("origin")
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| (
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "message": "Origen WebSocket requerido", "code": "WS_ORIGIN_REQUIRED" })),
        ))?;
    let allowed_origins = std::env::var("CORS_ALLOWED_ORIGINS").ok();
    if !websocket_origin_allowed(origin, allowed_origins.as_deref()) {
        return Err((
            StatusCode::FORBIDDEN,
            Json(serde_json::json!({ "message": "Origen WebSocket no permitido", "code": "WS_ORIGIN_DENIED" })),
        ));
    }

    let offered_protocols = headers
        .get("sec-websocket-protocol")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    let protocol_values: Vec<&str> = offered_protocols
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .collect();
    if !protocol_values.iter().any(|protocol| *protocol == TRANSCRIBE_WS_PROTOCOL) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "message": "Subprotocolo WebSocket no compatible", "code": "WS_PROTOCOL_REQUIRED" })),
        ));
    }
    let ticket = protocol_values
        .iter()
        .find_map(|protocol| protocol.strip_prefix(TRANSCRIBE_TICKET_PROTOCOL_PREFIX))
        .filter(|ticket| !ticket.is_empty())
        .ok_or_else(|| (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "Ticket de transcripción requerido", "code": "WS_TICKET_REQUIRED" })),
        ))?;

    let secret = configured_jwt_secret().map_err(|_| (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({ "message": "La autenticación no está configurada.", "code": "AUTH_CONFIGURATION_UNAVAILABLE" })),
    ))?;
    let claims = decode_transcribe_ticket(ticket, &secret).map_err(|_| (
        StatusCode::UNAUTHORIZED,
        Json(serde_json::json!({ "message": "Ticket de transcripción inválido o expirado", "code": "WS_TICKET_INVALID" })),
    ))?;
    if claims.purpose != "transcribe" || Uuid::parse_str(&claims.sub).is_err() {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "Ticket no autorizado para transcripción", "code": "WS_TICKET_SCOPE_INVALID" })),
        ));
    }
    if !consume_transcribe_ticket(&claims.jti, claims.exp) {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "message": "Ticket de transcripción ya utilizado o expirado", "code": "WS_TICKET_REPLAYED" })),
        ));
    }

    Ok(ws
        .max_message_size(TRANSCRIBE_MAX_CHUNK_BYTES)
        .max_frame_size(TRANSCRIBE_MAX_CHUNK_BYTES)
        .protocols([TRANSCRIBE_WS_PROTOCOL])
        .on_upgrade(handle_transcribe_socket))
}

async fn handle_transcribe_socket(mut socket: WebSocket) {
    use aws_sdk_transcribestreaming::{
        config::Region,
        types::{AudioEvent, AudioStream, LanguageCode, MediaEncoding, TranscriptResultStream},
        types::error::AudioStreamError,
        Client as TranscribeClient,
    };
    use std::{env, time::Duration};
    use tokio::sync::mpsc;

    let region = Region::new(env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string()));
    let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
        .region(region)
        .load()
        .await;

    let lang_code_str = env::var("AWS_TRANSCRIBE_LANGUAGE_CODE")
        .unwrap_or_else(|_| "en-US".to_string());
    let language = match lang_code_str.as_str() {
        "en-US" => LanguageCode::EnUs,
        "en-GB" => LanguageCode::EnGb,
        _       => LanguageCode::EnUs,
    };

    // Canal mpsc: el hilo WebSocket envía chunks PCM al stream de Transcribe
    // Tamaño 512: buffer suficiente para ráfagas sin bloquear el hilo receptor
    let (audio_tx, audio_rx) = mpsc::channel::<Vec<u8>>(512);
    let mut audio_tx = Some(audio_tx);

    // Convertir el canal mpsc en un Stream de AudioEvents para Transcribe
    let audio_stream = {
        let stream = async_stream::stream! {
            let mut rx = audio_rx;
            while let Some(chunk) = rx.recv().await {
                let event = AudioStream::AudioEvent(
                    AudioEvent::builder()
                        .audio_chunk(chunk.into())
                        .build(),
                );
                yield Ok::<AudioStream, AudioStreamError>(event);
            }
        };
        stream
    };

    let transcribe_client = TranscribeClient::new(&sdk_config);

    let transcribe_result = tokio::time::timeout(
        Duration::from_secs(30),
        transcribe_client
            .start_stream_transcription()
            .language_code(language)
            .media_sample_rate_hertz(16000)
            .media_encoding(MediaEncoding::Pcm)
            .audio_stream(audio_stream.into())
            .send(),
    )
    .await;

    let mut stream_response = match transcribe_result {
        Ok(Ok(response)) => response,
        Ok(Err(_error)) | Err(_) => {
            tracing::error!("No se pudo iniciar la sesión AWS Transcribe dentro del límite de tiempo");
            let msg = serde_json::json!({
                "error": "No se pudo iniciar la transcripción."
            }).to_string();
            let _ = socket.send(Message::Text(msg.into())).await;
            return;
        }
    };

    println!("🎙️ [WS Transcribe] Sesión AWS Transcribe iniciada");

    // Tarea que recibe resultados de Transcribe y los envía al frontend
    let (ws_tx, mut ws_rx_results) = mpsc::channel::<String>(128);

    tokio::spawn(async move {
        loop {
            match stream_response.transcript_result_stream.recv().await {
                Ok(Some(event)) => {
                    if let TranscriptResultStream::TranscriptEvent(ev) = event {
                        if let Some(t) = ev.transcript {
                            for result in t.results.unwrap_or_default() {
                                let is_final = !result.is_partial;
                                for alt in result.alternatives.unwrap_or_default() {
                                    if let Some(text) = alt.transcript {
                                        let trimmed = text.trim().to_string();
                                        if !trimmed.is_empty() {
                                            let json = serde_json::json!({
                                                "partial": trimmed,
                                                "is_final": is_final
                                            }).to_string();
                                            if ws_tx.send(json).await.is_err() {
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(None) => {
                    // Transcribe cerró el stream (se agotaron los eventos de audio)
                    let _ = ws_tx.send(
                        serde_json::json!({ "partial": "", "is_final": true, "done": true }).to_string()
                    ).await;
                    break;
                }
                Err(e) => {
                    eprintln!("⚠️ [WS Transcribe Recv Error]: {:?}", e);
                    break;
                }
            }
        }
    });

    // Limitar duración y volumen de datos para contener abuso/coste de AWS.
    let mut total_audio_bytes = 0usize;
    let mut stop_received = false;
    let duration_limit = tokio::time::sleep(Duration::from_secs(TRANSCRIBE_MAX_DURATION_SECONDS));
    tokio::pin!(duration_limit);

    // Loop principal. Al recibir "stop" se cierra la entrada de audio, pero
    // seguimos drenando los resultados de Transcribe para entregar la última frase.
    loop {
        let audio_sender = audio_tx.as_ref().cloned();
        tokio::select! {
            _ = &mut duration_limit => {
                let msg = serde_json::json!({
                    "error": "La sesión de transcripción alcanzó su duración máxima."
                }).to_string();
                let _ = socket.send(Message::Text(msg.into())).await;
                break;
            }
            // Mensajes entrantes del cliente (chunks PCM binarios o "stop" de texto)
            ws_msg = socket.recv() => {
                match ws_msg {
                    Some(Ok(Message::Binary(data))) => {
                        // Ignore late audio frames after stop, but keep polling
                        // the result channel so a noisy client cannot starve "done".
                        if !stop_received {
                            let chunk_bytes = data.len();
                            if chunk_bytes == 0 || chunk_bytes > TRANSCRIBE_MAX_CHUNK_BYTES {
                                let msg = serde_json::json!({
                                    "error": "Tamaño de fragmento de audio no permitido."
                                }).to_string();
                                let _ = socket.send(Message::Text(msg.into())).await;
                                break;
                            }
                            if total_audio_bytes.saturating_add(chunk_bytes) > TRANSCRIBE_MAX_AUDIO_BYTES {
                                let msg = serde_json::json!({
                                    "error": "La sesión de transcripción superó el límite de audio."
                                }).to_string();
                                let _ = socket.send(Message::Text(msg.into())).await;
                                break;
                            }
                            total_audio_bytes += chunk_bytes;
                            let Some(sender) = audio_sender.as_ref() else {
                                break;
                            };
                            if sender.send(data.to_vec()).await.is_err() {
                                break;
                            }
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if text.trim() == "stop" && !stop_received {
                            tracing::info!("Cliente solicitó finalizar la transcripción");
                            // Dropping the sender lets AWS finish the input stream;
                            // the loop stays alive until final results have been sent.
                            audio_tx.take();
                            stop_received = true;
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(e)) => {
                        eprintln!("⚠️ [WS Transcribe] Error WS: {:?}", e);
                        break;
                    }
                    _ => {}
                }
            }
            // Resultados de Transcribe → enviar al frontend
            result = ws_rx_results.recv() => {
                match result {
                    Some(json_str) => {
                        let done = serde_json::from_str::<serde_json::Value>(&json_str)
                            .ok()
                            .and_then(|value| value.get("done").and_then(|flag| flag.as_bool()))
                            .unwrap_or(false);
                        if socket.send(Message::Text(json_str.into())).await.is_err() {
                            break;
                        }
                        if done {
                            break;
                        }
                    }
                    None => break, // Canal cerrado
                }
            }
        }
    }

    println!("✅ [WS Transcribe] Sesión cerrada");
}


#[cfg(test)]
mod transcription_ticket_tests {
    use super::{
        allow_ticket_request, consume_transcribe_ticket, decode_transcribe_ticket,
        encode_transcribe_ticket, unix_time_seconds, websocket_origin_allowed,
        TRANSCRIBE_TICKET_MAX_PER_MINUTE,
    };
    use uuid::Uuid;

    const SECRET: &str = "transcribe-ticket-test-secret-0123456789abcdef";

    #[test]
    fn ticket_is_signed_scoped_and_short_lived() {
        let now = unix_time_seconds();
        let subject = Uuid::new_v4().to_string();
        let jti = Uuid::new_v4().to_string();
        let token = encode_transcribe_ticket(&subject, &jti, now + 60, SECRET).unwrap();
        let claims = decode_transcribe_ticket(&token, SECRET).unwrap();

        assert_eq!(claims.sub, subject);
        assert_eq!(claims.jti, jti);
        assert_eq!(claims.purpose, "transcribe");
        assert!(claims.exp <= now + 60);
        assert!(decode_transcribe_ticket(&token, "wrong-secret-that-is-long-enough-000").is_err());
    }

    #[test]
    fn expired_tickets_are_rejected() {
        let now = unix_time_seconds();
        let token = encode_transcribe_ticket(
            &Uuid::new_v4().to_string(),
            &Uuid::new_v4().to_string(),
            now.saturating_sub(1),
            SECRET,
        ).unwrap();
        assert!(decode_transcribe_ticket(&token, SECRET).is_err());
    }

    #[test]
    fn ticket_can_be_consumed_only_once_per_bff_process() {
        let jti = format!("test-{}", Uuid::new_v4());
        let expires = unix_time_seconds() + 60;
        assert!(consume_transcribe_ticket(&jti, expires));
        assert!(!consume_transcribe_ticket(&jti, expires));
    }

    #[test]
    fn ticket_requests_are_rate_limited_per_user() {
        let user = format!("rate-limit-{}", Uuid::new_v4());
        for _ in 0..TRANSCRIBE_TICKET_MAX_PER_MINUTE {
            assert!(allow_ticket_request(&user));
        }
        assert!(!allow_ticket_request(&user));
    }

    #[test]
    fn websocket_origin_must_match_an_exact_allowlisted_origin() {
        assert!(websocket_origin_allowed(
            "https://app.example.com",
            Some("https://app.example.com, http://localhost:3000"),
        ));
        assert!(!websocket_origin_allowed(
            "https://evil.example.com",
            Some("https://app.example.com, http://localhost:3000"),
        ));
        assert!(!websocket_origin_allowed(
            "http://localhost:3000.attacker.invalid",
            Some("http://localhost:3000"),
        ));
        assert!(websocket_origin_allowed("http://localhost:3000", None));
        assert!(!websocket_origin_allowed("https://app.example.com", None));
    }
}


#[cfg(test)]
mod evaluation_input_validation_tests {
    use super::{validate_evaluation_input, EvaluateAnswerBody, MAX_ANSWER_CHARS, MAX_AUDIO_BASE64_CHARS};

    fn valid_input() -> EvaluateAnswerBody {
        EvaluateAnswerBody {
            question_id: "question-123".to_string(),
            question: "Tell me about a backend system you improved.".to_string(),
            answer: "I measured the bottleneck carefully, added tracing, and improved our production p95 latency significantly.".to_string(),
            audio_base64: None,
        }
    }

    #[test]
    fn accepts_evaluation_input_within_limits() {
        assert!(validate_evaluation_input(&valid_input()).is_ok());
    }

    #[test]
    fn rejects_answer_over_limit() {
        let mut input = valid_input();
        input.answer = "a".repeat(MAX_ANSWER_CHARS + 1);
        assert!(validate_evaluation_input(&input).is_err());
    }

    #[test]
    fn rejects_audio_payload_over_limit() {
        let mut input = valid_input();
        input.audio_base64 = Some("A".repeat(MAX_AUDIO_BASE64_CHARS + 1));
        assert!(validate_evaluation_input(&input).is_err());
    }


    #[test]
    fn rejects_answer_below_minimum_word_count() {
        let mut input = valid_input();
        input.answer = "I fixed a bug.".to_string();
        assert!(validate_evaluation_input(&input).is_err());
    }

    #[test]
    fn rejects_raw_audio_payload_and_requires_transcription_first() {
        let mut input = valid_input();
        input.audio_base64 = Some("AAECAwQ=".to_string());
        assert!(validate_evaluation_input(&input).is_err());
    }

    #[test]
    fn rejects_missing_question_id() {
        let mut input = valid_input();
        input.question_id = "  ".to_string();
        assert!(validate_evaluation_input(&input).is_err());
    }
}
