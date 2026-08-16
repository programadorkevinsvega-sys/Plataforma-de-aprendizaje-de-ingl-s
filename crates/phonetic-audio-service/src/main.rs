mod aws_audio;
mod transliteration;

use std::sync::Arc;
use tonic::{transport::Server, Request, Response, Status};
use proto::phonetic_audio::phonetic_audio_service_server::{PhoneticAudioService, PhoneticAudioServiceServer};
use proto::phonetic_audio::{
    PhoneticRequest, PhoneticResponse, SynthesizeRequest, SynthesizeResponse,
    TranscribeRequest, TranscribeResponse,
};
use aws_audio::AwsAudioEngine;
use transliteration::PhoneticEngine;

#[derive(Clone)]
pub struct PhoneticAudioServiceImpl {
    aws_audio: Arc<AwsAudioEngine>,
    engine: Arc<PhoneticEngine>,
}

#[tonic::async_trait]
impl PhoneticAudioService for PhoneticAudioServiceImpl {
    async fn generate_phonetics(
        &self,
        request: Request<PhoneticRequest>,
    ) -> Result<Response<PhoneticResponse>, Status> {
        let text = request.into_inner().text;
        let slow = self.engine.transliterate(&text);
        let natural = self.engine.transliterate(&text);
        Ok(Response::new(PhoneticResponse {
            slow_phonetic: slow.as_str().to_string(),
            natural_phonetic: natural.as_str().to_string(),
        }))
    }

    async fn synthesize_audio(
        &self,
        request: Request<SynthesizeRequest>,
    ) -> Result<Response<SynthesizeResponse>, Status> {
        let text = request.into_inner().text;
        match self.aws_audio.synthesize_speech_polly(&text).await {
            Ok(b64) => Ok(Response::new(SynthesizeResponse { audio_base64: b64 })),
            Err(e) => Err(Status::internal(format!("Error sintetizando audio: {}", e))),
        }
    }

    async fn transcribe_audio(
        &self,
        request: Request<TranscribeRequest>,
    ) -> Result<Response<TranscribeResponse>, Status> {
        let audio_b64 = request.into_inner().audio_base64;
        match self.aws_audio.transcribe_audio_stream(&audio_b64).await {
            Ok(transcribed_text) => Ok(Response::new(TranscribeResponse {
                transcribed_text,
                language_code: self.aws_audio.transcribe_language_code.clone(),
            })),
            Err(e) => Err(Status::internal(format!("Error transcribiendo audio: {}", e))),
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let aws_audio = Arc::new(AwsAudioEngine::new());
    let engine = Arc::new(PhoneticEngine::new());

    tracing::info!("🔊 [AUDIO] Inicializando Phonetic Audio Engine & gRPC Server...");

    let aws_audio_clone = aws_audio.clone();
    tokio::spawn(async move {
        if let Ok(audio_b64) = aws_audio_clone.synthesize_speech_polly("Initialization check").await {
            tracing::info!("✅ [AUDIO] Test TTS Polly: {} bytes generados", audio_b64.len());
        }
    });

    let addr = "0.0.0.0:50054".parse()?;
    let service = PhoneticAudioServiceImpl { aws_audio, engine };

    tracing::info!("🎙️ [AUDIO] gRPC Server escuchando en {}", addr);

    Server::builder()
        .add_service(PhoneticAudioServiceServer::new(service))
        .serve(addr)
        .await?;

    Ok(())
}
