mod aws_audio;
mod transliteration;
mod tts;

use aws_audio::AwsAudioEngine;
use proto::phonetic_audio::phonetic_audio_service_server::{
    PhoneticAudioService, PhoneticAudioServiceServer,
};
use proto::phonetic_audio::{
    PhoneticRequest, PhoneticResponse, SynthesizeRequest, SynthesizeResponse, TranscribeRequest,
    TranscribeResponse,
};
use std::sync::Arc;
use std::time::Instant;
use tonic::{transport::Server, Request, Response, Status};
use transliteration::PhoneticEngine;
use tts::TtsEngine;

#[derive(Clone)]
pub struct PhoneticAudioServiceImpl {
    aws_audio: Arc<AwsAudioEngine>,
    tts: Arc<TtsEngine>,
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
        let correlation_id = request
            .metadata()
            .get("x-correlation-id")
            .and_then(|value| value.to_str().ok())
            .unwrap_or("none")
            .to_string();
        let request = request.into_inner();
        let started = Instant::now();
        let provider = self.tts.provider_name();

        match self
            .tts
            .synthesize(&request.text, &request.voice, &request.rate)
            .await
        {
            Ok(audio) => {
                tracing::info!(
                    provider,
                    model = %audio.model,
                    duration_ms = started.elapsed().as_millis() as u64,
                    audio_bytes = audio.audio_bytes,
                    playback_rate = audio.playback_rate,
                    correlation_id = %correlation_id,
                    "TTS synthesis completed"
                );
                Ok(Response::new(SynthesizeResponse {
                    audio_base64: audio.audio_base64,
                    format: "mp3".to_string(),
                    voice: audio.voice,
                    text: request.text,
                    provider: provider.to_string(),
                    model: audio.model,
                    playback_rate: audio.playback_rate,
                }))
            }
            Err(status) => {
                tracing::warn!(
                    provider,
                    grpc_code = ?status.code(),
                    duration_ms = started.elapsed().as_millis() as u64,
                    correlation_id = %correlation_id,
                    "TTS synthesis failed"
                );
                Err(status)
            }
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
            Err(error) => {
                tracing::error!(error_type = %std::any::type_name_of_val(&*error), "AWS Transcribe request failed");
                Err(Status::unavailable("AWS Transcribe no está disponible"))
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    let tts = Arc::new(TtsEngine::from_env().await?);
    if std::env::args().any(|argument| argument == "--smoke-test-tts") {
        let provider = tts.provider_name();
        let audio = tts
            .synthesize("DevFluency deployment smoke test.", "Joanna", "")
            .await?;
        if audio.audio_bytes == 0 || audio.audio_base64.is_empty() {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "TTS smoke test returned empty audio",
            )
            .into());
        }
        tracing::info!(
            provider,
            model = %audio.model,
            audio_bytes = audio.audio_bytes,
            "TTS functional smoke test passed"
        );
        return Ok(());
    }

    let aws_audio = Arc::new(AwsAudioEngine::new());
    let engine = Arc::new(PhoneticEngine::new());

    tracing::info!(
        provider = tts.provider_name(),
        "TTS provider configured; no remote synthesis is executed during startup"
    );
    tracing::info!("🔊 [AUDIO] Inicializando Phonetic Audio Engine & gRPC Server...");

    let configured_addr = std::env::var("PHONETIC_SERVICE_BIND_ADDR").ok();
    let addr = common::parse_bind_addr(configured_addr.as_deref(), "127.0.0.1:50054")?;
    let service = PhoneticAudioServiceImpl {
        aws_audio,
        tts,
        engine,
    };

    tracing::info!("🎙️ [AUDIO] gRPC Server escuchando en {}", addr);

    Server::builder()
        .add_service(PhoneticAudioServiceServer::new(service))
        .serve(addr)
        .await?;

    Ok(())
}
