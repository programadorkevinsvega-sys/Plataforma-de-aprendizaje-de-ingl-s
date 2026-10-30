mod domain;
mod jwt;
mod service;

use proto::auth::auth_service_server::AuthServiceServer;
use service::MyAuthService;
use sqlx::postgres::PgPoolOptions;
use std::net::SocketAddr;
use std::sync::Arc;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    jwt::JwtService::validate_configuration().map_err(|error| {
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
        .expect("❌ No se pudo conectar a PostgreSQL. Verifica DATABASE_URL y que el contenedor esté corriendo.");

    let pool = Arc::new(pool);

    let configured_addr = std::env::var("AUTH_SERVICE_BIND_ADDR").ok();
    let addr: SocketAddr = common::parse_bind_addr(configured_addr.as_deref(), "127.0.0.1:50051")?;
    let auth_service = MyAuthService::new(pool);

    println!(
        "🔒 [Fase 2] auth-identity-service gRPC Server corriendo en {}",
        addr
    );

    Server::builder()
        .add_service(AuthServiceServer::new(auth_service))
        .serve(addr)
        .await?;

    Ok(())
}
