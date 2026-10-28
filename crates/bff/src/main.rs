mod auth_handler;
mod content_handler;
mod exam_handler;
mod progress_handler;
mod srs_handler;
mod user_handler;

use auth_handler::{login_handler, me_handler, register_handler};
use content_handler::{
    mark_word_complete_handler, synthesize_speech_handler, today_lesson_handler,
    vocabulary_list_handler,
};
use exam_handler::{
    evaluate_answer_handler, get_drill_handler, next_question_handler, transcribe_ws_handler,
};
use progress_handler::record_progress_handler;
use srs_handler::{get_due_cards_handler, review_card_handler};
use user_handler::{
    achievements_handler, leaderboard_handler, logout_handler, progress_summary_real_handler,
    update_profile_handler,
};

use axum::{
    http::Method,
    routing::{get, patch, post},
    Router,
};
use proto::ai_evaluator::ai_evaluator_service_client::AiEvaluatorServiceClient;
use proto::auth::auth_service_client::AuthServiceClient;
use proto::content::content_service_client::ContentServiceClient;
use proto::gamification::gamification_service_client::GamificationServiceClient;
use proto::srs::srs_service_client::SrsServiceClient;
use std::net::SocketAddr;
use tonic::transport::Channel;
use tower_http::cors::{Any, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub auth_client: AuthServiceClient<Channel>,
    pub content_client: ContentServiceClient<Channel>,
    pub srs_client: SrsServiceClient<Channel>,
    pub ai_client: AiEvaluatorServiceClient<Channel>,
    pub gamification_client: GamificationServiceClient<Channel>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    // Clientes gRPC lazy — se conectan al primer uso
    let auth_client =
        AuthServiceClient::new(Channel::from_static("http://127.0.0.1:50051").connect_lazy());
    let content_client =
        ContentServiceClient::new(Channel::from_static("http://127.0.0.1:50052").connect_lazy());
    let ai_client =
        AiEvaluatorServiceClient::new(Channel::from_static("http://127.0.0.1:50053").connect_lazy());
    let srs_client =
        SrsServiceClient::new(Channel::from_static("http://127.0.0.1:50055").connect_lazy());
    let gamification_client =
        GamificationServiceClient::new(Channel::from_static("http://127.0.0.1:50056").connect_lazy());

    let state = AppState {
        auth_client,
        content_client,
        srs_client,
        ai_client,
        gamification_client,
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers(Any);

    let app = Router::new()
        // Health
        .route("/health", get(|| async { "OK - DevFluency BFF Enterprise" }))
        // Auth
        .route("/api/v1/auth/register", post(register_handler))
        .route("/api/v1/auth/login", post(login_handler))
        .route("/api/v1/auth/me", get(me_handler))
        .route("/api/v1/auth/logout", post(logout_handler))
        // Progress / Dashboard
        .route("/api/v1/progress/summary", get(progress_summary_real_handler))
        .route("/api/v1/progress/leaderboard", get(leaderboard_handler))
        .route("/api/v1/progress/achievements", get(achievements_handler))
        // Content / Vocabulary
        .route("/api/v1/content/vocabulary", get(vocabulary_list_handler))
        .route("/api/v1/content/lessons/today", get(today_lesson_handler))
        .route("/api/v1/content/speech", post(synthesize_speech_handler))
        .route(
            "/api/v1/content/vocabulary/:id/complete",
            post(mark_word_complete_handler),
        )
        // SRS — Anki SM-2
        .route("/api/v1/srs/due", get(get_due_cards_handler))
        .route("/api/v1/srs/cards/:id/review", post(review_card_handler))
        // Progress
        .route("/api/v1/progress/learn", post(record_progress_handler))
        // Exam / Interview IA
        .route("/api/v1/exam/questions/next", post(next_question_handler))
        .route("/api/v1/exam/evaluate", post(evaluate_answer_handler))
        .route("/api/v1/exam/results/:id/drill", get(get_drill_handler))
        .route("/api/v1/exam/transcribe/ws", get(transcribe_ws_handler))
        // Users
        .route("/api/v1/users/me", patch(update_profile_handler))
        .layer(cors)
        .with_state(state);

    let configured_addr = std::env::var("BFF_HTTP_BIND_ADDR").ok();
    let addr: SocketAddr = common::parse_bind_addr(configured_addr.as_deref(), "127.0.0.1:8080")?;
    println!("🚀 [Fase 2] BFF HTTP Gateway corriendo en http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
