use axum::{
    extract::{Json, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::{HeaderMap, StatusCode},
    response::Response,
};
use proto::ai_evaluator::{EvaluateExamAnswerRequest, GenerateTargetedDrillRequest};
use serde::{Deserialize, Serialize};

use crate::AppState;
use crate::srs_handler::validate_token_from_headers;

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

/// POST /api/v1/exam/questions/next — Siguiente pregunta de entrevista desde PostgreSQL
pub async fn next_question_handler(
    State(mut state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<InterviewQuestionDto>, (StatusCode, Json<serde_json::Value>)> {
    let user_id = validate_token_from_headers(&headers, &mut state).await.unwrap_or_default();
    let user_level = if !user_id.is_empty() {
        let profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
            user_id: user_id.clone(),
        });
        match state.auth_client.get_user_profile(profile_req).await {
            Ok(pres) => pres.into_inner().current_level,
            Err(_) => "A0".to_string(),
        }
    } else {
        "A0".to_string()
    };

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
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "message": format!("Error obteniendo pregunta: {}", e.message()) })),
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

    let user_level = if !user_id.is_empty() {
        let profile_req = tonic::Request::new(proto::auth::GetUserProfileRequest {
            user_id: user_id.clone(),
        });
        match state.auth_client.get_user_profile(profile_req).await {
            Ok(pres) => pres.into_inner().current_level,
            Err(_) => "A0".to_string(),
        }
    } else {
        "A0".to_string()
    };

    let response_text = if body.answer.is_empty() && body.audio_base64.is_some() {
        format!("[Audio Transcrito]: Respuesta oral a la pregunta '{}'", body.question)
    } else if !body.answer.is_empty() {
        body.answer
    } else {
        format!("Respuesta a: {}", body.question)
    };

    let request = tonic::Request::new(EvaluateExamAnswerRequest {
        user_id,
        question_id: body.question_id,
        user_text_response: response_text,
        target_level: user_level,
    });

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
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "message": e.message(), "code": "EVAL_ERROR" })),
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

    let request = tonic::Request::new(GenerateTargetedDrillRequest {
        user_id,
        weak_skills: vec!["Pronunciación".to_string(), "Fluidez".to_string()],
    });

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
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "message": e.message(), "code": "DRILL_ERROR" })),
        )),
    }
}

/// GET /api/v1/exam/transcribe/ws — WebSocket de transcripción en tiempo real
/// Protocolo:
///   Cliente → Servidor: frames Binary con chunks PCM-16 de 640 bytes (20ms a 16kHz)
///   Servidor → Cliente: frames Text con JSON {"partial": "...", "is_final": bool}
///   Cliente → Servidor: frame Text "stop" para cerrar la sesión
pub async fn transcribe_ws_handler(
    ws: WebSocketUpgrade,
) -> Response {
    ws.on_upgrade(handle_transcribe_socket)
}

async fn handle_transcribe_socket(mut socket: WebSocket) {
    use aws_sdk_transcribestreaming::{
        config::Region,
        types::{AudioEvent, AudioStream, LanguageCode, MediaEncoding, TranscriptResultStream},
        types::error::AudioStreamError,
        Client as TranscribeClient,
    };
    use std::env;
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

    let transcribe_result = transcribe_client
        .start_stream_transcription()
        .language_code(language)
        .media_sample_rate_hertz(16000)
        .media_encoding(MediaEncoding::Pcm)
        .audio_stream(audio_stream.into())
        .send()
        .await;

    let mut stream_response = match transcribe_result {
        Ok(r) => r,
        Err(e) => {
            eprintln!("❌ [WS Transcribe] Error iniciando sesión: {:?}", e);
            let msg = serde_json::json!({ "error": format!("{:?}", e) }).to_string();
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

    // Loop principal: recibir chunks del WebSocket y reenviarlos a Transcribe
    loop {
        tokio::select! {
            // Mensajes entrantes del cliente (chunks PCM binarios o "stop" de texto)
            ws_msg = socket.recv() => {
                match ws_msg {
                    Some(Ok(Message::Binary(data))) => {
                        // Chunk PCM-16 de 640 bytes (20ms)
                        if audio_tx.send(data.to_vec()).await.is_err() {
                            break;
                        }
                    }
                    Some(Ok(Message::Text(text))) => {
                        if text.trim() == "stop" {
                            println!("🛑 [WS Transcribe] Cliente envió 'stop', cerrando stream");
                            drop(audio_tx); // Señala fin del stream a Transcribe
                            break;
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
                        if socket.send(Message::Text(json_str.into())).await.is_err() {
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
