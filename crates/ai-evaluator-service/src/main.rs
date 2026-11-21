mod aws_bedrock;
mod domain;
mod learning_activity;
mod service;

use aws_bedrock::AwsBedrockClient;
use proto::ai_evaluator::ai_evaluator_service_server::AiEvaluatorServiceServer;
use service::MyAIEvaluatorService;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    common::validate_jwt_configuration().map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
    })?;

    let bedrock = AwsBedrockClient::new();
    println!(
        "🤖 [AWS Bedrock AI Texto Client Inicializado]: Modelo {}",
        bedrock.model_id
    );

    let database_url = std::env::var("DATABASE_URL").map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "DATABASE_URL debe estar configurada para persistir intentos de actividades",
        )
    })?;
    let database_acquire_timeout =
        common::timeout::duration_from_env("DATABASE_ACQUIRE_TIMEOUT_SECONDS", 5, 30)?;
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(database_acquire_timeout)
        .connect(&database_url)
        .await
        .map_err(|error| {
            std::io::Error::new(
                std::io::ErrorKind::ConnectionRefused,
                format!("No se pudo conectar a PostgreSQL para las evaluaciones: {error}"),
            )
        })?;

    let configured_addr = std::env::var("AI_SERVICE_BIND_ADDR").ok();
    let addr: SocketAddr = common::parse_bind_addr(configured_addr.as_deref(), "127.0.0.1:50053")?;
    let ai_service = MyAIEvaluatorService::new(pool);

    println!(
        "🤖 [Fase 4] ai-evaluator-service gRPC Server corriendo en {}",
        addr
    );

    Server::builder()
        .add_service(AiEvaluatorServiceServer::new(ai_service))
        .serve(addr)
        .await?;

    Ok(())
}
