mod domain;
mod service;

use proto::gamification::gamification_service_server::GamificationServiceServer;
use service::MyGamificationService;
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

    // Print demo stats on startup
    use domain::UserGamificationStats;
    use uuid::Uuid;
    let demo = UserGamificationStats::new(Uuid::new_v4());
    println!("🏆 [Fase 5] gamification-progress-service listo.");
    println!("🔥 Nivel Actual: {}, XP: {}, Monedas: 💎 {}", demo.get_level(), demo.xp, demo.coins);

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
        .expect("❌ No se pudo conectar a PostgreSQL en gamification-progress-service.");

    let pool = Arc::new(pool);
    let configured_addr = std::env::var("GAMIFICATION_SERVICE_BIND_ADDR").ok();
    let addr: SocketAddr = common::parse_bind_addr(configured_addr.as_deref(), "127.0.0.1:50056")?;
    let gamification_service = MyGamificationService::new(pool);

    println!("🏆 [Fase 5] gamification-progress-service gRPC Server corriendo en {}", addr);

    Server::builder()
        .add_service(GamificationServiceServer::new(gamification_service))
        .serve(addr)
        .await?;

    Ok(())
}
