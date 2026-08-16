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

    // Print demo stats on startup
    use domain::UserGamificationStats;
    use uuid::Uuid;
    let demo = UserGamificationStats::new(Uuid::new_v4());
    println!("🏆 [Fase 5] gamification-progress-service listo.");
    println!("🔥 Nivel Actual: {}, XP: {}, Monedas: 💎 {}", demo.get_level(), demo.xp, demo.coins);

    let database_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:Kevins1612522026@127.0.0.1:5432/devfluency_db".to_string());

    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await
        .expect("❌ No se pudo conectar a PostgreSQL en gamification-progress-service.");

    let pool = Arc::new(pool);
    let addr: SocketAddr = "0.0.0.0:50056".parse()?;
    let gamification_service = MyGamificationService::new(pool);

    println!("🏆 [Fase 5] gamification-progress-service gRPC Server corriendo en {}", addr);

    Server::builder()
        .add_service(GamificationServiceServer::new(gamification_service))
        .serve(addr)
        .await?;

    Ok(())
}
