use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use proto::phonetic_audio::{
    phonetic_audio_service_client::PhoneticAudioServiceClient, SynthesizeRequest,
};
use std::{env, error::Error};
use tonic::{transport::Channel, Request};

const SMOKE_TEXT: &str = "Deployment smoke test";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let endpoint = env::var("TTS_SMOKE_ENDPOINT")
        .unwrap_or_else(|_| "http://127.0.0.1:50054".to_string());
    let expected_provider = env::var("TTS_PROVIDER")
        .unwrap_or_else(|_| "aws".to_string())
        .trim()
        .to_ascii_lowercase();

    let channel = Channel::from_shared(endpoint.clone())?.connect().await?;
    let mut client = PhoneticAudioServiceClient::new(channel);
    let response = client
        .synthesize_audio(Request::new(SynthesizeRequest {
            text: SMOKE_TEXT.to_string(),
            voice: "Matthew".to_string(),
            rate: String::new(),
        }))
        .await?
        .into_inner();

    if response.provider != expected_provider {
        return Err(format!(
            "TTS provider mismatch: expected '{}', received '{}'",
            expected_provider, response.provider
        )
        .into());
    }
    if response.format != "mp3" {
        return Err(format!("Unexpected TTS audio format: '{}'", response.format).into());
    }
    if response.model.trim().is_empty() {
        return Err("TTS response did not include a model identifier".into());
    }
    if response.text != SMOKE_TEXT {
        return Err("TTS response text does not match the smoke-test request".into());
    }

    let audio = BASE64_STANDARD.decode(&response.audio_base64)?;
    if audio.len() < 4 {
        return Err(format!(
            "TTS returned an empty or truncated audio payload ({} bytes)",
            audio.len()
        )
        .into());
    }

    println!(
        "TTS smoke test passed: provider={}, model={}, format={}, audio_bytes={}",
        response.provider,
        response.model,
        response.format,
        audio.len()
    );
    Ok(())
}
