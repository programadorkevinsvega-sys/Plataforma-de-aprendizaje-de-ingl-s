mod auth_handler;
mod content_handler;
mod exam_handler;
mod progress_handler;
mod request_limiter;
mod srs_handler;
mod user_handler;

use auth_handler::{login_handler, me_handler, refresh_handler, register_handler};
use content_handler::{
    mark_word_complete_handler, synthesize_speech_handler, today_lesson_handler,
    vocabulary_list_handler,
};
use exam_handler::{
    create_transcribe_ticket_handler, evaluate_answer_handler, get_drill_handler,
    next_question_handler, transcribe_ws_handler,
};
use progress_handler::record_progress_handler;
use srs_handler::{get_due_cards_handler, review_card_handler};
use user_handler::{
    achievements_handler, leaderboard_handler, logout_handler, progress_summary_real_handler,
    update_profile_handler,
};

use axum::{
    http::{
        header::{AUTHORIZATION, CONTENT_TYPE},
        HeaderValue, Method,
    },
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
use tower_http::cors::{AllowOrigin, CorsLayer};

#[derive(Clone)]
pub struct AppState {
    pub auth_client: AuthServiceClient<Channel>,
    pub content_client: ContentServiceClient<Channel>,
    pub srs_client: SrsServiceClient<Channel>,
    pub ai_client: AiEvaluatorServiceClient<Channel>,
    pub gamification_client: GamificationServiceClient<Channel>,
}

/// Parse comma-separated exact HTTP(S) origins. Wildcards and URL paths are rejected.
fn parse_cors_allowed_origins(raw: Option<&str>) -> Result<Vec<HeaderValue>, &'static str> {
    let raw = raw
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("http://localhost:3000");
    let mut origins = Vec::new();

    for origin in raw
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if origin == "*" {
            return Err("CORS_ALLOWED_ORIGINS no puede usar el comodín '*'");
        }

        let authority = origin
            .strip_prefix("https://")
            .or_else(|| origin.strip_prefix("http://"))
            .ok_or("CORS_ALLOWED_ORIGINS solo admite orígenes HTTP(S)")?;
        if authority.is_empty() || authority.chars().any(|c| matches!(c, '/' | '?' | '#')) {
            return Err("Cada origen CORS debe incluir solo esquema, host y puerto; no rutas");
        }

        let value = HeaderValue::from_str(origin)
            .map_err(|_| "CORS_ALLOWED_ORIGINS contiene un origen inválido")?;
        if !origins.contains(&value) {
            origins.push(value);
        }
    }

    if origins.is_empty() {
        return Err("CORS_ALLOWED_ORIGINS debe contener al menos un origen");
    }
    Ok(origins)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    common::validate_jwt_configuration().map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
    })?;

    // Clientes gRPC lazy — se conectan al primer uso
    let auth_client =
        AuthServiceClient::new(Channel::from_static("http://127.0.0.1:50051").connect_lazy());
    let content_client =
        ContentServiceClient::new(Channel::from_static("http://127.0.0.1:50052").connect_lazy());
    let ai_client = AiEvaluatorServiceClient::new(
        Channel::from_static("http://127.0.0.1:50053").connect_lazy(),
    );
    let srs_client =
        SrsServiceClient::new(Channel::from_static("http://127.0.0.1:50055").connect_lazy());
    let gamification_client = GamificationServiceClient::new(
        Channel::from_static("http://127.0.0.1:50056").connect_lazy(),
    );

    let state = AppState {
        auth_client,
        content_client,
        srs_client,
        ai_client,
        gamification_client,
    };

    let allowed_origins =
        parse_cors_allowed_origins(std::env::var("CORS_ALLOWED_ORIGINS").ok().as_deref())
            .map_err(|message| std::io::Error::new(std::io::ErrorKind::InvalidInput, message))?;

    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::list(allowed_origins))
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE]);

    let app = Router::new()
        // Health
        .route(
            "/health",
            get(|| async { "OK - DevFluency BFF Enterprise" }),
        )
        // Auth
        .route("/api/v1/auth/register", post(register_handler))
        .route("/api/v1/auth/login", post(login_handler))
        .route("/api/v1/auth/refresh", post(refresh_handler))
        .route("/api/v1/auth/me", get(me_handler))
        .route("/api/v1/auth/logout", post(logout_handler))
        // Progress / Dashboard
        .route(
            "/api/v1/progress/summary",
            get(progress_summary_real_handler),
        )
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
        .route(
            "/api/v1/exam/transcribe/ticket",
            post(create_transcribe_ticket_handler),
        )
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

#[cfg(test)]
mod cors_configuration_tests {
    use super::parse_cors_allowed_origins;

    #[test]
    fn defaults_to_local_frontend_origin() {
        let origins = parse_cors_allowed_origins(None).unwrap();
        assert_eq!(origins.len(), 1);
        assert_eq!(origins[0].to_str().unwrap(), "http://localhost:3000");
    }

    #[test]
    fn accepts_multiple_explicit_origins_without_duplicates() {
        let origins = parse_cors_allowed_origins(Some(
            "https://app.example.com, http://localhost:3000, https://app.example.com",
        ))
        .unwrap();
        assert_eq!(origins.len(), 2);
    }

    #[test]
    fn rejects_wildcard_and_origins_with_paths() {
        assert!(parse_cors_allowed_origins(Some("*")).is_err());
        assert!(parse_cors_allowed_origins(Some("https://app.example.com/path")).is_err());
    }
}
