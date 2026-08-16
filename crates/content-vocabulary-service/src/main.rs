mod service;

use proto::content::content_service_server::ContentServiceServer;
use service::MyContentService;
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
        .expect("❌ No se pudo conectar a PostgreSQL en content-vocabulary-service.");

    let pool = Arc::new(pool);
    let addr: SocketAddr = "0.0.0.0:50052".parse()?;
    let content_service = MyContentService::new(pool);

    println!("📚 [Fase 3] content-vocabulary-service gRPC Server corriendo en {}", addr);

    Server::builder()
        .add_service(ContentServiceServer::new(content_service))
        .serve(addr)
        .await?;

    Ok(())
}
