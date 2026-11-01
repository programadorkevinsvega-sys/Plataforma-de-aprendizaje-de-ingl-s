use aws_sdk_polly::{
    config::Region,
    types::{Engine, OutputFormat, TextType, VoiceId},
    Client as PollyClient,
};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use reqwest::header::CONTENT_TYPE;
use serde_json::{json, Value};
use std::{env, sync::Arc, time::Duration};
use tonic::Status;

const LOGICAL_VOICES: &[&str] = &[
    "Lupe", "Mia", "Lucia", "Enrique", "Conchita", "Matthew", "Joanna", "Ruth", "Stephen",
];
const SPANISH_VOICES: &[&str] = &["Lupe", "Mia", "Lucia", "Enrique", "Conchita"];
const ENGLISH_SPEAKERS: &[&str] = &[
    "amalthea", "andromeda", "apollo", "arcas", "aries", "asteria", "athena", "atlas",
    "aurora", "callista", "cora", "cordelia", "delia", "draco", "electra", "harmonia",
    "helena", "hera", "hermes", "hyperion", "iris", "janus", "juno", "jupiter", "luna",
    "mars", "minerva", "neptune", "odysseus", "ophelia", "orion", "orpheus", "pandora",
    "phoebe", "pluto", "saturn", "thalia", "theia", "vesta", "zeus",
];
const SPANISH_SPEAKERS: &[&str] = &[
    "sirio", "nestor", "carina", "celeste", "alvaro", "diana", "aquila", "selena",
    "estrella", "javier",
];
const MODEL_EN: &str = "@cf/deepgram/aura-2-en";
const MODEL_ES: &str = "@cf/deepgram/aura-2-es";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProviderKind {
    Aws,
    Cloudflare,
}

fn parse_provider(value: Option<&str>) -> Result<ProviderKind, String> {
    match value.unwrap_or("aws").trim().to_ascii_lowercase().as_str() {
        "aws" => Ok(ProviderKind::Aws),
        "cloudflare" => Ok(ProviderKind::Cloudflare),
        other => Err(format!(
            "TTS_PROVIDER inválido: '{}'. Valores admitidos: aws, cloudflare",
            other
        )),
    }
}

#[derive(Debug)]
enum TtsError {
    InvalidInput(&'static str),
    RateLimited,
    ProviderAuthentication,
    Timeout,
    InvalidResponse,
    Upstream,
}

impl TtsError {
    fn category(&self) -> &'static str {
        match self {
            Self::InvalidInput(_) => "invalid_input",
            Self::RateLimited => "rate_limited",
            Self::ProviderAuthentication => "provider_authentication",
            Self::Timeout => "timeout",
            Self::InvalidResponse => "invalid_response",
            Self::Upstream => "upstream",
        }
    }

    fn into_status(self) -> Status {
        match self {
            Self::InvalidInput(message) => Status::invalid_argument(message),
            Self::RateLimited => Status::resource_exhausted("TTS_PROVIDER_RATE_LIMITED"),
            Self::Timeout => Status::deadline_exceeded("TTS_PROVIDER_TIMEOUT"),
            Self::ProviderAuthentication => {
                Status::unavailable("TTS_PROVIDER_AUTHENTICATION_FAILED")
            }
            Self::InvalidResponse => Status::unavailable("TTS_PROVIDER_INVALID_RESPONSE"),
            Self::Upstream => Status::unavailable("TTS_PROVIDER_UNAVAILABLE"),
        }
    }
}

struct ProviderAudio {
    bytes: Vec<u8>,
    model: String,
    playback_rate: f64,
}

#[tonic::async_trait]
trait TtsProvider: Send + Sync {
    fn name(&self) -> &'static str;
    fn default_voice(&self) -> &str;
    async fn synthesize(
        &self,
        text: &str,
        logical_voice: &str,
        rate: &str,
    ) -> Result<ProviderAudio, TtsError>;
}

pub struct SynthesizedAudio {
    pub audio_base64: String,
    pub audio_bytes: usize,
    pub voice: String,
    pub model: String,
    pub playback_rate: f64,
}

pub struct TtsEngine {
    provider: Arc<dyn TtsProvider>,
}

impl TtsEngine {
    pub async fn from_env() -> Result<Self, Box<dyn std::error::Error>> {
        match parse_provider(env::var("TTS_PROVIDER").ok().as_deref())? {
            ProviderKind::Aws => {
                let region = env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
                if region.trim().is_empty() {
                    return Err("AWS_REGION no puede estar vacío cuando TTS_PROVIDER=aws".into());
                }
                let default_voice =
                    env::var("AWS_POLLY_VOICE_ID").unwrap_or_else(|_| "Matthew".to_string());
                if !is_logical_voice_valid(&default_voice) {
                    return Err(format!(
                        "AWS_POLLY_VOICE_ID no es una voz admitida: '{}'",
                        default_voice
                    )
                    .into());
                }

                let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
                    .region(Region::new(region))
                    .load()
                    .await;
                let client = PollyClient::new(&sdk_config);
                Ok(Self {
                    provider: Arc::new(AwsPollyProvider {
                        client,
                        default_voice,
                    }),
                })
            }
            ProviderKind::Cloudflare => {
                let account_id = required_env("CLOUDFLARE_ACCOUNT_ID")?;
                if account_id.len() != 32 || !account_id.chars().all(|c| c.is_ascii_hexdigit()) {
                    return Err(
                        "CLOUDFLARE_ACCOUNT_ID debe ser un identificador Cloudflare hexadecimal de 32 caracteres"
                            .into(),
                    );
                }
                let api_token = required_env("CLOUDFLARE_API_TOKEN")?;
                let model_en = env::var("CLOUDFLARE_TTS_MODEL_EN")
                    .unwrap_or_else(|_| MODEL_EN.to_string());
                let model_es = env::var("CLOUDFLARE_TTS_MODEL_ES")
                    .unwrap_or_else(|_| MODEL_ES.to_string());
                if model_en != MODEL_EN || model_es != MODEL_ES {
                    return Err(format!(
                        "Los modelos Cloudflare TTS admitidos son '{}' y '{}'",
                        MODEL_EN, MODEL_ES
                    )
                    .into());
                }
                let speaker_en = env::var("CLOUDFLARE_TTS_SPEAKER_EN")
                    .unwrap_or_else(|_| "luna".to_string());
                let speaker_es = env::var("CLOUDFLARE_TTS_SPEAKER_ES")
                    .unwrap_or_else(|_| "aquila".to_string());
                if !ENGLISH_SPEAKERS.contains(&speaker_en.as_str()) {
                    return Err(format!(
                        "CLOUDFLARE_TTS_SPEAKER_EN no es válido para Aura-2 English: '{}'",
                        speaker_en
                    )
                    .into());
                }
                if !SPANISH_SPEAKERS.contains(&speaker_es.as_str()) {
                    return Err(format!(
                        "CLOUDFLARE_TTS_SPEAKER_ES no es válido para Aura-2 Spanish: '{}'",
                        speaker_es
                    )
                    .into());
                }
                let timeout_seconds = env::var("CLOUDFLARE_TTS_TIMEOUT_SECONDS")
                    .unwrap_or_else(|_| "30".to_string())
                    .parse::<u64>()?;
                if !(1..=120).contains(&timeout_seconds) {
                    return Err(
                        "CLOUDFLARE_TTS_TIMEOUT_SECONDS debe estar entre 1 y 120".into(),
                    );
                }
                let client = reqwest::Client::builder()
                    .timeout(Duration::from_secs(timeout_seconds))
                    .build()?;

                Ok(Self {
                    provider: Arc::new(CloudflareWorkersAiProvider {
                        client,
                        account_id,
                        api_token,
                        model_en,
                        model_es,
                        speaker_en,
                        speaker_es,
                    }),
                })
            }
        }
    }

    pub fn provider_name(&self) -> &'static str {
        self.provider.name()
    }

    pub async fn synthesize(
        &self,
        text: &str,
        voice: &str,
        rate: &str,
    ) -> Result<SynthesizedAudio, Status> {
        if text.trim().is_empty() || text.chars().count() > 500 {
            return Err(Status::invalid_argument(
                "El texto debe contener entre 1 y 500 caracteres",
            ));
        }
        let selected_voice = if voice.trim().is_empty() {
            self.provider.default_voice()
        } else {
            voice.trim()
        };
        if !is_logical_voice_valid(selected_voice) {
            return Err(Status::invalid_argument("INVALID_SPEECH_VOICE"));
        }
        if !is_rate_valid(rate) {
            return Err(Status::invalid_argument("INVALID_SPEECH_RATE"));
        }

        let provider = self.provider.name();
        let started = std::time::Instant::now();
        let generated = self
            .provider
            .synthesize(text, selected_voice, rate)
            .await
            .map_err(|error| {
                tracing::error!(
                    provider,
                    error_type = error.category(),
                    duration_ms = started.elapsed().as_millis() as u64,
                    "TTS provider request failed"
                );
                error.into_status()
            })?;

        let audio_bytes = generated.bytes.len();
        Ok(SynthesizedAudio {
            audio_base64: BASE64_STANDARD.encode(&generated.bytes),
            audio_bytes,
            voice: selected_voice.to_string(),
            model: generated.model,
            playback_rate: generated.playback_rate,
        })
    }
}

fn required_env(name: &str) -> Result<String, Box<dyn std::error::Error>> {
    let value = env::var(name).map_err(|_| format!("Falta la variable obligatoria {}", name))?;
    if value.trim().is_empty() {
        return Err(format!("La variable obligatoria {} está vacía", name).into());
    }
    Ok(value)
}

fn is_logical_voice_valid(voice: &str) -> bool {
    LOGICAL_VOICES.contains(&voice)
}

fn is_spanish_voice(voice: &str) -> bool {
    SPANISH_VOICES.contains(&voice)
}

fn is_rate_valid(rate: &str) -> bool {
    rate.is_empty() || matches!(rate, "x-slow" | "slow" | "medium" | "fast")
}

fn playback_rate(rate: &str) -> f64 {
    match rate {
        "x-slow" => 0.65,
        "slow" => 0.8,
        "fast" => 1.15,
        _ => 1.0,
    }
}

fn polly_voice(voice: &str) -> VoiceId {
    match voice {
        "Lupe" => VoiceId::Lupe,
        "Mia" => VoiceId::Mia,
        "Lucia" => VoiceId::Lucia,
        "Enrique" => VoiceId::Enrique,
        "Conchita" => VoiceId::Conchita,
        "Joanna" => VoiceId::Joanna,
        "Ruth" => VoiceId::Ruth,
        "Stephen" => VoiceId::Stephen,
        _ => VoiceId::Matthew,
    }
}

fn escape_ssml_text(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

struct AwsPollyProvider {
    client: PollyClient,
    default_voice: String,
}

#[tonic::async_trait]
impl TtsProvider for AwsPollyProvider {
    fn name(&self) -> &'static str {
        "aws"
    }

    fn default_voice(&self) -> &str {
        &self.default_voice
    }

    async fn synthesize(
        &self,
        text: &str,
        logical_voice: &str,
        rate: &str,
    ) -> Result<ProviderAudio, TtsError> {
        let (input_text, text_type) = if rate.is_empty() {
            (text.to_string(), TextType::Text)
        } else {
            (
                format!(
                    "<speak><prosody rate=\"{}\">{}</prosody></speak>",
                    rate,
                    escape_ssml_text(text)
                ),
                TextType::Ssml,
            )
        };

        let response = self
            .client
            .synthesize_speech()
            .text(input_text)
            .text_type(text_type)
            .voice_id(polly_voice(logical_voice))
            .engine(Engine::Neural)
            .output_format(OutputFormat::Mp3)
            .send()
            .await
            .map_err(|_| TtsError::Upstream)?;

        let bytes = response
            .audio_stream
            .collect()
            .await
            .map_err(|_| TtsError::Upstream)?
            .into_bytes()
            .to_vec();

        if bytes.is_empty() {
            return Err(TtsError::InvalidResponse);
        }

        Ok(ProviderAudio {
            bytes,
            model: "aws-polly-neural".to_string(),
            playback_rate: 1.0,
        })
    }
}

struct CloudflareWorkersAiProvider {
    client: reqwest::Client,
    account_id: String,
    api_token: String,
    model_en: String,
    model_es: String,
    speaker_en: String,
    speaker_es: String,
}

#[tonic::async_trait]
impl TtsProvider for CloudflareWorkersAiProvider {
    fn name(&self) -> &'static str {
        "cloudflare"
    }

    fn default_voice(&self) -> &str {
        "Matthew"
    }

    async fn synthesize(
        &self,
        text: &str,
        logical_voice: &str,
        rate: &str,
    ) -> Result<ProviderAudio, TtsError> {
        let is_spanish = is_spanish_voice(logical_voice);
        let (model, speaker) = if is_spanish {
            (&self.model_es, &self.speaker_es)
        } else {
            (&self.model_en, &self.speaker_en)
        };
        let url = format!(
            "https://api.cloudflare.com/client/v4/accounts/{}/ai/run/{}",
            self.account_id, model
        );

        let response = self
            .client
            .post(url)
            .bearer_auth(&self.api_token)
            .json(&json!({
                "text": text,
                "speaker": speaker,
                "encoding": "mp3"
            }))
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    TtsError::Timeout
                } else {
                    TtsError::Upstream
                }
            })?;

        let status = response.status();
        if !status.is_success() {
            let error = match status.as_u16() {
                401 | 403 => TtsError::ProviderAuthentication,
                429 => TtsError::RateLimited,
                _ => TtsError::Upstream,
            };
            tracing::warn!(
                provider = "cloudflare",
                model = %model,
                http_status = status.as_u16(),
                error_type = error.category(),
                "Cloudflare Workers AI returned an error"
            );
            return Err(error);
        }

        let content_type = response
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("")
            .to_string();
        let response_bytes = response.bytes().await.map_err(|error| {
            if error.is_timeout() {
                TtsError::Timeout
            } else {
                TtsError::Upstream
            }
        })?;
        let audio = decode_cloudflare_audio(&content_type, &response_bytes)?;
        if !is_mp3(&audio) {
            return Err(TtsError::InvalidResponse);
        }

        Ok(ProviderAudio {
            bytes: audio,
            model: model.to_string(),
            playback_rate: playback_rate(rate),
        })
    }
}

fn decode_cloudflare_audio(content_type: &str, response: &[u8]) -> Result<Vec<u8>, TtsError> {
    let looks_json = content_type.to_ascii_lowercase().contains("json")
        || response.first().is_some_and(|byte| matches!(byte, b'{' | b'"'));
    if !looks_json {
        return Ok(response.to_vec());
    }

    let value: Value =
        serde_json::from_slice(response).map_err(|_| TtsError::InvalidResponse)?;
    let encoded = value
        .pointer("/result/audio")
        .or_else(|| value.get("audio"))
        .or_else(|| value.get("result"))
        .and_then(Value::as_str)
        .or_else(|| value.as_str())
        .ok_or(TtsError::InvalidResponse)?;
    let encoded = encoded
        .strip_prefix("data:audio/mpeg;base64,")
        .unwrap_or(encoded);
    BASE64_STANDARD
        .decode(encoded.trim())
        .map_err(|_| TtsError::InvalidResponse)
}

fn is_mp3(bytes: &[u8]) -> bool {
    bytes.starts_with(b"ID3")
        || (bytes.len() >= 2 && bytes[0] == 0xFF && (bytes[1] & 0xE0) == 0xE0)
}

fn validate_model_and_speaker(model_en: &str, model_es: &str, speaker_en: &str, speaker_es: &str) -> bool {
    model_en == MODEL_EN
        && model_es == MODEL_ES
        && ENGLISH_SPEAKERS.contains(&speaker_en)
        && SPANISH_SPEAKERS.contains(&speaker_es)
}

#[cfg(test)]
mod tests {
    use super::{
        decode_cloudflare_audio, is_logical_voice_valid, is_mp3, is_rate_valid, is_spanish_voice,
        parse_provider, playback_rate, validate_model_and_speaker, ProviderKind, BASE64_STANDARD,
        MODEL_EN, MODEL_ES,
    };

    #[test]
    fn defaults_to_aws_when_provider_is_missing() {
        assert_eq!(parse_provider(None).unwrap(), ProviderKind::Aws);
    }

    #[test]
    fn accepts_both_provider_values_case_insensitively() {
        assert_eq!(parse_provider(Some("aws")).unwrap(), ProviderKind::Aws);
        assert_eq!(
            parse_provider(Some("CLOUDFLARE")).unwrap(),
            ProviderKind::Cloudflare
        );
    }

    #[test]
    fn rejects_an_unknown_provider() {
        assert!(parse_provider(Some("other")).is_err());
    }

    #[test]
    fn validates_logical_frontend_voices() {
        assert!(is_logical_voice_valid("Matthew"));
        assert!(is_logical_voice_valid("Lupe"));
        assert!(!is_logical_voice_valid("not-a-voice"));
        assert!(is_spanish_voice("Lupe"));
        assert!(!is_spanish_voice("Joanna"));
    }

    #[test]
    fn accepts_supported_speech_rates_and_rejects_unknown_values() {
        for rate in ["", "x-slow", "slow", "medium", "fast"] {
            assert!(is_rate_valid(rate));
        }
        assert!(!is_rate_valid("very-slow"));
        assert_eq!(playback_rate("x-slow"), 0.65);
        assert_eq!(playback_rate("slow"), 0.8);
        assert_eq!(playback_rate("medium"), 1.0);
    }

    #[test]
    fn validates_documented_models_and_language_specific_speakers() {
        assert!(validate_model_and_speaker(
            MODEL_EN, MODEL_ES, "luna", "aquila"
        ));
        assert!(!validate_model_and_speaker(
            MODEL_EN, MODEL_ES, "aquila", "luna"
        ));
    }

    #[test]
    fn decodes_cloudflare_json_base64_audio_and_binary_audio() {
        let mp3 = b"ID3mock-mp3";
        let encoded = BASE64_STANDARD.encode(mp3);
        let json = format!(r#"{{"success":true,"result":{{"audio":"{}"}}}}"#, encoded);
        let decoded =
            decode_cloudflare_audio("application/json", json.as_bytes()).unwrap();
        assert_eq!(decoded, mp3);
        assert_eq!(
            decode_cloudflare_audio("audio/mpeg", mp3).unwrap(),
            mp3
        );
        assert!(is_mp3(&decoded));
    }

    #[test]
    fn rejects_invalid_cloudflare_audio_payloads() {
        assert!(decode_cloudflare_audio("application/json", b"{invalid").is_err());
        assert!(decode_cloudflare_audio("application/json", br#"{"result":{}}"#).is_err());
        assert!(!is_mp3(b"not-an-mp3"));
    }
}
