mod aws_bedrock;
mod domain;
mod service;

use aws_bedrock::AwsBedrockClient;
use proto::ai_evaluator::ai_evaluator_service_server::AiEvaluatorServiceServer;
use service::MyAIEvaluatorService;
use std::net::SocketAddr;
use tonic::transport::Server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let bedrock = AwsBedrockClient::new();
    println!("🤖 [AWS Bedrock AI Texto Client Inicializado]: Modelo {}", bedrock.model_id);

    let addr: SocketAddr = "0.0.0.0:50053".parse()?;
    let ai_service = MyAIEvaluatorService::default();

    println!("🤖 [Fase 4] ai-evaluator-service gRPC Server corriendo en {}", addr);

    Server::builder()
        .add_service(AiEvaluatorServiceServer::new(ai_service))
        .serve(addr)
        .await?;

    Ok(())
}
