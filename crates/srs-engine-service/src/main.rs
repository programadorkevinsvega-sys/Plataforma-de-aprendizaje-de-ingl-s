mod domain;
mod service;

use proto::srs::srs_service_server::SrsServiceServer;
use service::MySrsService;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:Kevins1612522026@127.0.0.1:5432/devfluency_db".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("❌ No se pudo conectar a PostgreSQL en srs-engine-service.");

    let pool = Arc::new(pool);
    let addr: SocketAddr = "0.0.0.0:50055".parse()?;
    let srs_service = MySrsService::new(pool);

    println!("🧠 [Fase 5] srs-engine-service Anki SM-2 gRPC Server corriendo en {}", addr);

    Server::builder()
        .add_service(SrsServiceServer::new(srs_service))
        .serve(addr)
        .await?;

    Ok(())
}
