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

    common::validate_jwt_configuration().map_err(|error| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, error.to_string())
    })?;

    let database_url = std::env::var("DATABASE_URL").map_err(|_| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "DATABASE_URL debe estar configurada; no se usa una credencial predeterminada",
        )
    })?;

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("❌ No se pudo conectar a PostgreSQL en content-vocabulary-service.");

    let pool = Arc::new(pool);
    let configured_addr = std::env::var("CONTENT_SERVICE_BIND_ADDR").ok();
    let addr: SocketAddr = common::parse_bind_addr(configured_addr.as_deref(), "127.0.0.1:50052")?;
    let content_service = MyContentService::new(pool);

    println!(
        "📚 [Fase 3] content-vocabulary-service gRPC Server corriendo en {}",
        addr
    );

    Server::builder()
        .add_service(ContentServiceServer::new(content_service))
        .serve(addr)
        .await?;

    Ok(())
}
