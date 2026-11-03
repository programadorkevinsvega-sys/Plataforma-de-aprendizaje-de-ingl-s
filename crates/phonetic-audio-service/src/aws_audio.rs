use aws_sdk_transcribestreaming::{
    config::Region as TranscribeRegion,
    types::error::AudioStreamError,
    types::{AudioEvent, AudioStream, LanguageCode, MediaEncoding, TranscriptResultStream},
    Client as TranscribeClient,
};
use std::{env, future::Future, time::Duration};

async fn with_transcribe_timeout<T, F>(
    timeout: Duration,
    operation: F,
) -> Result<T, Box<dyn std::error::Error + Send + Sync>>
where
    F: Future<Output = Result<T, Box<dyn std::error::Error + Send + Sync>>>,
{
    tokio::time::timeout(timeout, operation)
        .await
        .map_err(|_| {
            Box::new(std::io::Error::new(
                std::io::ErrorKind::TimedOut,
                "AWS Transcribe exceeded AWS_TRANSCRIBE_TIMEOUT_SECONDS",
            )) as Box<dyn std::error::Error + Send + Sync>
        })?
}

pub struct AwsAudioEngine {
    pub transcribe_language_code: String,
    pub aws_region: String,
}

impl AwsAudioEngine {
    pub fn new() -> Self {
        Self {
            transcribe_language_code: env::var("AWS_TRANSCRIBE_LANGUAGE_CODE")
                .unwrap_or_else(|_| "en-US".to_string()),
            aws_region: env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
        }
    }

    /// Transcribe audio recibido en base64 usando AWS Transcribe Streaming (STT).
    /// TTS se gestiona de forma independiente en el módulo tts.
    pub async fn transcribe_audio_stream(
        &self,
        audio_base64: &str,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let audio_bytes: Vec<u8> =
            base64::Engine::decode(&base64::engine::general_purpose::STANDARD, audio_base64)?;
        let operation_timeout =
            common::timeout::duration_from_env("AWS_TRANSCRIBE_TIMEOUT_SECONDS", 45, 300)?;

        with_transcribe_timeout(operation_timeout, self.transcribe_audio_bytes(audio_bytes)).await
    }

    async fn transcribe_audio_bytes(
        &self,
        audio_bytes: Vec<u8>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
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

        let audio_event = AudioStream::AudioEvent(
            AudioEvent::builder()
                .audio_chunk(audio_bytes.into())
                .build(),
        );

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
                                    for alternative in result.alternatives.unwrap_or_default() {
                                        if let Some(text) = alternative.transcript {
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
                Err(error) => {
                    tracing::warn!(?error, "AWS Transcribe stream receive failed");
                    return Err(Box::new(std::io::Error::new(
                        std::io::ErrorKind::Other,
                        "AWS Transcribe stream receive failed",
                    )));
                }
            }
        }

        let transcript = full_transcript.trim().to_string();
        tracing::info!(
            transcript_characters = transcript.chars().count(),
            "AWS Transcribe stream completed"
        );

        Ok(if transcript.is_empty() {
            "No se pudo transcribir. Por favor intente de nuevo.".to_string()
        } else {
            transcript
        })
    }
}

#[cfg(test)]
mod tests {
    use super::with_transcribe_timeout;
    use std::{error::Error, io, time::Duration};

    #[tokio::test]
    async fn total_timeout_cancels_a_slow_transcribe_operation() {
        let error = with_transcribe_timeout(Duration::from_millis(5), async {
            tokio::time::sleep(Duration::from_millis(30)).await;
            Ok::<(), Box<dyn Error + Send + Sync>>(())
        })
        .await
        .unwrap_err();

        assert_eq!(
            error.downcast_ref::<io::Error>().unwrap().kind(),
            io::ErrorKind::TimedOut
        );
    }

    #[tokio::test]
    async fn provider_errors_are_preserved_and_not_reported_as_timeouts() {
        let error = with_transcribe_timeout(Duration::from_secs(1), async {
            Err::<(), Box<dyn Error + Send + Sync>>(Box::new(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "provider credentials unavailable",
            )))
        })
        .await
        .unwrap_err();

        assert_eq!(error.to_string(), "provider credentials unavailable");
        assert_eq!(
            error.downcast_ref::<io::Error>().unwrap().kind(),
            io::ErrorKind::PermissionDenied
        );
    }
}
