use aws_sdk_polly::{
    config::Region,
    types::{Engine, OutputFormat, VoiceId},
    Client as PollyClient,
};
use aws_sdk_transcribestreaming::{
    config::Region as TranscribeRegion,
    types::error::AudioStreamError,
    types::{AudioEvent, AudioStream, LanguageCode, MediaEncoding, TranscriptResultStream},
    Client as TranscribeClient,
};
use std::env;

pub struct AwsAudioEngine {
    pub polly_voice_id: String,
    pub transcribe_language_code: String,
    pub aws_region: String,
}

impl AwsAudioEngine {
    pub fn new() -> Self {
        Self {
            polly_voice_id: env::var("AWS_POLLY_VOICE_ID")
                .unwrap_or_else(|_| "Matthew".to_string()),
            transcribe_language_code: env::var("AWS_TRANSCRIBE_LANGUAGE_CODE")
                .unwrap_or_else(|_| "en-US".to_string()),
            aws_region: env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
        }
    }

    /// Sintetiza texto en audio MP3 usando AWS Polly Neural Voices (TTS)
    /// Devuelve los bytes del archivo MP3 codificados en base64
    pub async fn synthesize_speech_polly(
        &self,
        text: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let region = Region::new(self.aws_region.clone());
        let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(region)
            .load()
            .await;

        let polly_client = PollyClient::new(&sdk_config);

        let voice_id = match self.polly_voice_id.as_str() {
            "Matthew" => VoiceId::Matthew,
            "Joanna" => VoiceId::Joanna,
            "Ruth" => VoiceId::Ruth,
            "Stephen" => VoiceId::Stephen,
            _ => VoiceId::Matthew,
        };

        let response = polly_client
            .synthesize_speech()
            .text(text)
            .voice_id(voice_id)
            .engine(Engine::Neural)
            .output_format(OutputFormat::Mp3)
            .send()
            .await?;

        let audio_bytes = response.audio_stream.collect().await?;
        let bytes_vec = audio_bytes.into_bytes().to_vec();

        println!(
            "🔊 [AWS Polly Neural TTS] {} bytes MP3 generados para voz '{}'",
            bytes_vec.len(),
            self.polly_voice_id
        );

        Ok(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &bytes_vec,
        ))
    }

    /// Transcribe audio recibido en base64 usando AWS Transcribe Streaming (STT)
    pub async fn transcribe_audio_stream(
        &self,
        audio_base64: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let audio_bytes: Vec<u8> =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, audio_base64)?;

        let region = TranscribeRegion::new(self.aws_region.clone());
        let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(region)
            .load()
            .await;

        let transcribe_client = TranscribeClient::new(&sdk_config);

        let language = match self.transcribe_language_code.as_str() {
            "en-US" => LanguageCode::EnUs,
            "en-GB" => LanguageCode::EnGb,
            _ => LanguageCode::EnUs,
        };

        // Construir el evento de audio: Vec<u8> → Blob (From<Vec<u8>> está implementado)
        let audio_event = AudioStream::AudioEvent(
            AudioEvent::builder()
                .audio_chunk(audio_bytes.into()) // Vec<u8> → Blob
                .build(),
        );

        // Envolver en un Stream de Rust (futures::stream::once)
        let audio_stream = futures::stream::once(std::future::ready(Ok::<
            AudioStream,
            AudioStreamError,
        >(audio_event)));

        let mut stream_response = transcribe_client
            .start_stream_transcription()
            .language_code(language)
            .media_sample_rate_hertz(16000)
            .media_encoding(MediaEncoding::Pcm)
            .audio_stream(audio_stream.into())
            .send()
            .await?;

        let mut full_transcript = String::new();

        loop {
            match stream_response.transcript_result_stream.recv().await {
                Ok(Some(event)) => {
                    if let TranscriptResultStream::TranscriptEvent(ev) = event {
                        if let Some(transcript) = ev.transcript {
                            for result in transcript.results.unwrap_or_default() {
                                if !result.is_partial {
                                    for alt in result.alternatives.unwrap_or_default() {
                                        if let Some(text) = alt.transcript {
                                            full_transcript.push_str(&text);
                                            full_transcript.push(' ');
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                Ok(None) => break,
                Err(e) => {
                    eprintln!("⚠️ [AWS Transcribe] Error en stream: {:?}", e);
                    break;
                }
            }
        }

        let transcript = full_transcript.trim().to_string();
        println!("🎙️ [AWS Transcribe STT] Transcripción: \"{}\"", transcript);

        Ok(if transcript.is_empty() {
            "No se pudo transcribir. Por favor intente de nuevo.".to_string()
        } else {
            transcript
        })
    }
}
