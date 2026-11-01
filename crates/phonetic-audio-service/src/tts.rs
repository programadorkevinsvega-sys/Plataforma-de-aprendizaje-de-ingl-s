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
const CLOUDFLARE_API_BASE_URL: &str = "https://api.cloudflare.com";

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
    RateLimited,
    ProviderAuthentication,
    Timeout,
    InvalidResponse,
    Upstream,
}

impl TtsError {
    fn category(&self) -> &'static str {
        match self {
            Self::RateLimited => "rate_limited",
            Self::ProviderAuthentication => "provider_authentication",
            Self::Timeout => "timeout",
            Self::InvalidResponse => "invalid_response",
            Self::Upstream => "upstream",
        }
    }

    fn into_status(self) -> Status {
        match self {
            Self::RateLimited => Status::resource_exhausted("TTS_PROVIDER_RATE_LIMITED"),
            Self::Timeout => Status::deadline_exceeded("TTS_PROVIDER_TIMEOUT"),
            Self::ProviderAuthentication => {
                Status::unavailable("TTS_PROVIDER_AUTHENTICATION_FAILED")
            }
            Self::InvalidResponse => Status::data_loss("TTS_PROVIDER_INVALID_RESPONSE"),
            Self::Upstream => Status::unknown("TTS_UPSTREAM_FAILURE"),
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
    fn model_for_voice(&self, logical_voice: &str) -> &str;
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
        let provider: Arc<dyn TtsProvider> =
            match parse_provider(env::var("TTS_PROVIDER").ok().as_deref())? {
                ProviderKind::Aws => {
                    let region =
                        env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string());
                    if region.trim().is_empty() {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::InvalidInput,
                            "AWS_REGION no puede estar vacío cuando TTS_PROVIDER=aws",
                        )
                        .into());
                    }

                    let default_voice = env::var("AWS_POLLY_VOICE_ID")
                        .unwrap_or_else(|_| "Matthew".to_string());
                    if !is_logical_voice_valid(&default_voice) {
                        return Err(std::io::Error::new(
                            std::io::ErrorKind::InvalidInput,
                            format!(
                                "AWS_POLLY_VOICE_ID no es una voz admitida: '{}'",
                                default_voice
                            ),
                        )
                        .into());
                    }

                    let timeout_seconds = parse_timeout_seconds(
                        "AWS_POLLY_TIMEOUT_SECONDS",
                        env::var("AWS_POLLY_TIMEOUT_SECONDS").ok(),
                    )
                    .map_err(|message| {
                        std::io::Error::new(std::io::ErrorKind::InvalidInput, message)
                    })?;

                    let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
                        .region(Region::new(region))
                        .load()
                        .await;
                    let client = PollyClient::new(&sdk_config);

                    Arc::new(AwsPollyProvider {
                        client,
                        default_voice,
                        timeout_seconds,
                    })
                }
                ProviderKind::Cloudflare => {
                    let config = CloudflareConfig::from_env().map_err(|message| {
                        std::io::Error::new(std::io::ErrorKind::InvalidInput, message)
                    })?;
                    let client = reqwest::Client::builder()
                        .timeout(Duration::from_secs(config.timeout_seconds))
                        .build()?;

                    Arc::new(CloudflareWorkersAiProvider {
                        client,
                        api_base_url: CLOUDFLARE_API_BASE_URL.to_string(),
                        account_id: config.account_id,
                        api_token: config.api_token,
                        model_en: config.model_en,
                        model_es: config.model_es,
                        speaker_en: config.speaker_en,
                        speaker_es: config.speaker_es,
                    })
                }
            };

        Ok(Self { provider })
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
        let model = self.provider.model_for_voice(selected_voice);
        let started = std::time::Instant::now();
        let generated = self
            .provider
            .synthesize(text, selected_voice, rate)
            .await
            .map_err(|error| {
                tracing::error!(
                    provider,
                    model,
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

struct CloudflareConfig {
    account_id: String,
    api_token: String,
    model_en: String,
    model_es: String,
    speaker_en: String,
    speaker_es: String,
    timeout_seconds: u64,
}

impl CloudflareConfig {
    fn from_env() -> Result<Self, String> {
        Self::parse(
            env::var("CLOUDFLARE_ACCOUNT_ID").ok(),
            env::var("CLOUDFLARE_API_TOKEN").ok(),
            env::var("CLOUDFLARE_TTS_MODEL_EN").ok(),
            env::var("CLOUDFLARE_TTS_MODEL_ES").ok(),
            env::var("CLOUDFLARE_TTS_SPEAKER_EN").ok(),
            env::var("CLOUDFLARE_TTS_SPEAKER_ES").ok(),
            env::var("CLOUDFLARE_TTS_TIMEOUT_SECONDS").ok(),
        )
    }

    fn parse(
        account_id: Option<String>,
        api_token: Option<String>,
        model_en: Option<String>,
        model_es: Option<String>,
        speaker_en: Option<String>,
        speaker_es: Option<String>,
        timeout_seconds: Option<String>,
    ) -> Result<Self, String> {
        let account_id = required_config_value("CLOUDFLARE_ACCOUNT_ID", account_id)?;
        if account_id.len() != 32 || !account_id.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(
                "CLOUDFLARE_ACCOUNT_ID debe ser un identificador hexadecimal de 32 caracteres"
                    .to_string(),
            );
        }
        let api_token = required_config_value("CLOUDFLARE_API_TOKEN", api_token)?;
        let model_en = model_en.unwrap_or_else(|| MODEL_EN.to_string());
        let model_es = model_es.unwrap_or_else(|| MODEL_ES.to_string());
        if model_en != MODEL_EN || model_es != MODEL_ES {
            return Err(format!(
                "Los modelos Cloudflare TTS admitidos son '{}' y '{}'",
                MODEL_EN, MODEL_ES
            ));
        }

        let speaker_en = speaker_en.unwrap_or_else(|| "luna".to_string());
        let speaker_es = speaker_es.unwrap_or_else(|| "aquila".to_string());
        if !ENGLISH_SPEAKERS.contains(&speaker_en.as_str()) {
            return Err(format!(
                "CLOUDFLARE_TTS_SPEAKER_EN no es válido para Aura-2 English: '{}'",
                speaker_en
            ));
        }
        if !SPANISH_SPEAKERS.contains(&speaker_es.as_str()) {
            return Err(format!(
                "CLOUDFLARE_TTS_SPEAKER_ES no es válido para Aura-2 Spanish: '{}'",
                speaker_es
            ));
        }

        let timeout_seconds =
            parse_timeout_seconds("CLOUDFLARE_TTS_TIMEOUT_SECONDS", timeout_seconds)?;
        Ok(Self {
            account_id,
            api_token,
            model_en,
            model_es,
            speaker_en,
            speaker_es,
            timeout_seconds,
        })
    }
}

fn required_config_value(name: &str, value: Option<String>) -> Result<String, String> {
    let value = value.ok_or_else(|| format!("Falta la variable obligatoria {}", name))?;
    if value.trim().is_empty() {
        return Err(format!("La variable obligatoria {} está vacía", name));
    }
    Ok(value.trim().to_string())
}

fn parse_timeout_seconds(name: &str, value: Option<String>) -> Result<u64, String> {
    let seconds = value
        .unwrap_or_else(|| "30".to_string())
        .parse::<u64>()
        .map_err(|_| format!("{} debe ser un número entero", name))?;
    if !(1..=120).contains(&seconds) {
        return Err(format!("{} debe estar entre 1 y 120", name));
    }
    Ok(seconds)
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

fn polly_synthesis_input(text: &str, rate: &str) -> (String, TextType) {
    if rate.is_empty() {
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
    }
}

struct AwsPollyProvider {
    client: PollyClient,
    default_voice: String,
    timeout_seconds: u64,
}

#[tonic::async_trait]
impl TtsProvider for AwsPollyProvider {
    fn name(&self) -> &'static str {
        "aws"
    }

    fn default_voice(&self) -> &str {
        &self.default_voice
    }

    fn model_for_voice(&self, _logical_voice: &str) -> &str {
        "aws-polly-neural"
    }

    async fn synthesize(
        &self,
        text: &str,
        logical_voice: &str,
        rate: &str,
    ) -> Result<ProviderAudio, TtsError> {
        let (input_text, text_type) = polly_synthesis_input(text, rate);

        let bytes = tokio::time::timeout(
            Duration::from_secs(self.timeout_seconds),
            async {
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

                let audio = response
                    .audio_stream
                    .collect()
                    .await
                    .map_err(|_| TtsError::Upstream)?;
                Ok::<Vec<u8>, TtsError>(audio.into_bytes().to_vec())
            },
        )
        .await
        .map_err(|_| TtsError::Timeout)??;

        if !is_mp3(&bytes) {
            return Err(TtsError::InvalidResponse);
        }

        Ok(ProviderAudio {
            bytes,
            model: self.model_for_voice(logical_voice).to_string(),
            playback_rate: 1.0,
        })
    }
}

struct CloudflareWorkersAiProvider {
    client: reqwest::Client,
    api_base_url: String,
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

    fn model_for_voice(&self, logical_voice: &str) -> &str {
        if is_spanish_voice(logical_voice) {
            &self.model_es
        } else {
            &self.model_en
        }
    }

    async fn synthesize(
        &self,
        text: &str,
        logical_voice: &str,
        rate: &str,
    ) -> Result<ProviderAudio, TtsError> {
        let (model, speaker) = cloudflare_model_and_speaker(
            logical_voice,
            &self.model_en,
            &self.model_es,
            &self.speaker_en,
            &self.speaker_es,
        );
        let url = cloudflare_model_url(&self.api_base_url, &self.account_id, model);

        let response = self
            .client
            .post(url)
            .bearer_auth(&self.api_token)
            .json(&cloudflare_request_body(text, speaker))
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
            let error = classify_cloudflare_status(status.as_u16());
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

fn cloudflare_model_and_speaker<'a>(
    logical_voice: &str,
    model_en: &'a str,
    model_es: &'a str,
    speaker_en: &'a str,
    speaker_es: &'a str,
) -> (&'a str, &'a str) {
    if is_spanish_voice(logical_voice) {
        (model_es, speaker_es)
    } else {
        (model_en, speaker_en)
    }
}

fn cloudflare_model_url(api_base_url: &str, account_id: &str, model: &str) -> String {
    format!(
        "{}/client/v4/accounts/{}/ai/run/{}",
        api_base_url.trim_end_matches('/'),
        account_id,
        model
    )
}

fn cloudflare_request_body(text: &str, speaker: &str) -> Value {
    json!({
        "text": text,
        "speaker": speaker,
        "encoding": "mp3"
    })
}

fn classify_cloudflare_status(status: u16) -> TtsError {
    match status {
        401 | 403 => TtsError::ProviderAuthentication,
        408 | 504 => TtsError::Timeout,
        429 => TtsError::RateLimited,
        _ => TtsError::Upstream,
    }
}

fn decode_cloudflare_audio(content_type: &str, response: &[u8]) -> Result<Vec<u8>, TtsError> {
    let first_non_whitespace = response
        .iter()
        .copied()
        .find(|byte| !byte.is_ascii_whitespace());
    let looks_json = content_type.to_ascii_lowercase().contains("json")
        || first_non_whitespace.is_some_and(|byte| matches!(byte, b'{' | b'"'));
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

#[cfg(test)]
fn validate_model_and_speaker(
    model_en: &str,
    model_es: &str,
    speaker_en: &str,
    speaker_es: &str,
) -> bool {
    model_en == MODEL_EN
        && model_es == MODEL_ES
        && ENGLISH_SPEAKERS.contains(&speaker_en)
        && SPANISH_SPEAKERS.contains(&speaker_es)
}

#[cfg(test)]
mod tests {
    use super::{
        classify_cloudflare_status, cloudflare_model_and_speaker, cloudflare_model_url,
        cloudflare_request_body, decode_cloudflare_audio, is_logical_voice_valid, is_mp3,
        is_rate_valid, is_spanish_voice, parse_provider, parse_timeout_seconds, playback_rate,
        polly_synthesis_input, required_config_value, validate_model_and_speaker,
        CloudflareConfig, CloudflareWorkersAiProvider, ProviderKind, TtsProvider, BASE64_STANDARD,
        MODEL_EN, MODEL_ES,
    };
    use std::time::Duration;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

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
        assert_eq!(playback_rate("fast"), 1.15);
    }

    #[test]
    fn builds_polly_ssml_for_x_slow_and_escapes_user_text() {
        let (ssml, _) = polly_synthesis_input("A & B < C", "x-slow");
        assert!(ssml.contains("<prosody rate=\"x-slow\">"));
        assert!(ssml.contains("A &amp; B &lt; C"));
        let (natural, _) = polly_synthesis_input("Hello", "");
        assert_eq!(natural, "Hello");
    }

    #[test]
    fn maps_frontend_logical_voices_to_documented_cloudflare_languages() {
        let (english_model, english_speaker) =
            cloudflare_model_and_speaker("Joanna", MODEL_EN, MODEL_ES, "luna", "aquila");
        assert_eq!(english_model, MODEL_EN);
        assert_eq!(english_speaker, "luna");

        let (spanish_model, spanish_speaker) =
            cloudflare_model_and_speaker("Lupe", MODEL_EN, MODEL_ES, "luna", "aquila");
        assert_eq!(spanish_model, MODEL_ES);
        assert_eq!(spanish_speaker, "aquila");
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
    fn rejects_missing_cloudflare_account_or_token() {
        let missing_account = CloudflareConfig::parse(
            None,
            Some("token".to_string()),
            None,
            None,
            None,
            None,
            None,
        );
        assert!(missing_account.err().unwrap().contains("CLOUDFLARE_ACCOUNT_ID"));

        let missing_token = CloudflareConfig::parse(
            Some("0123456789abcdef0123456789abcdef".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
        );
        assert!(missing_token.err().unwrap().contains("CLOUDFLARE_API_TOKEN"));
        assert!(required_config_value("TOKEN", Some("   ".to_string())).is_err());
    }

    #[test]
    fn rejects_invalid_cloudflare_model_speaker_and_timeout_configuration() {
        let account = Some("0123456789abcdef0123456789abcdef".to_string());
        let token = Some("token".to_string());
        let invalid_model = CloudflareConfig::parse(
            account.clone(),
            token.clone(),
            Some("@cf/other/model".to_string()),
            None,
            None,
            None,
            None,
        );
        assert!(invalid_model.is_err());

        let invalid_english_speaker = CloudflareConfig::parse(
            account.clone(),
            token.clone(),
            None,
            None,
            Some("aquila".to_string()),
            None,
            None,
        );
        assert!(invalid_english_speaker.is_err());

        let invalid_spanish_speaker = CloudflareConfig::parse(
            account.clone(),
            token.clone(),
            None,
            None,
            None,
            Some("luna".to_string()),
            None,
        );
        assert!(invalid_spanish_speaker.is_err());
        assert!(parse_timeout_seconds("timeout", Some("0".to_string())).is_err());
        assert!(parse_timeout_seconds("timeout", Some("slow".to_string())).is_err());
        assert_eq!(parse_timeout_seconds("timeout", None).unwrap(), 30);

        let valid = CloudflareConfig::parse(
            account,
            token,
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap();
        assert_eq!(valid.model_en, MODEL_EN);
        assert_eq!(valid.model_es, MODEL_ES);
        assert_eq!(valid.speaker_en, "luna");
        assert_eq!(valid.speaker_es, "aquila");
    }

    #[test]
    fn builds_documented_cloudflare_endpoint_and_payload() {
        let url = cloudflare_model_url(
            "https://api.cloudflare.com/",
            "0123456789abcdef0123456789abcdef",
            MODEL_EN,
        );
        assert_eq!(
            url,
            format!(
                "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/{}",
                MODEL_EN
            )
        );
        let body = cloudflare_request_body("Hello", "luna");
        assert_eq!(body["text"], "Hello");
        assert_eq!(body["speaker"], "luna");
        assert_eq!(body["encoding"], "mp3");
    }

    #[test]
    fn maps_cloudflare_authentication_rate_limit_and_upstream_errors() {
        assert_eq!(
            classify_cloudflare_status(401).category(),
            "provider_authentication"
        );
        assert_eq!(classify_cloudflare_status(429).category(), "rate_limited");
        assert_eq!(classify_cloudflare_status(500).category(), "upstream");
        assert_eq!(classify_cloudflare_status(504).category(), "timeout");
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

    async fn spawn_mock_response(
        status: u16,
        content_type: &'static str,
        response_body: Vec<u8>,
        delay: Duration,
    ) -> (String, tokio::task::JoinHandle<String>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let task = tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut chunk = [0u8; 2048];

            loop {
                let count = socket.read(&mut chunk).await.unwrap();
                if count == 0 {
                    break;
                }
                request.extend_from_slice(&chunk[..count]);
                let Some(header_end) = request.windows(4).position(|part| part == b"\r\n\r\n")
                else {
                    continue;
                };
                let headers = String::from_utf8_lossy(&request[..header_end]);
                let content_length = headers
                    .lines()
                    .find_map(|line| {
                        let (name, value) = line.split_once(':')?;
                        name.eq_ignore_ascii_case("content-length")
                            .then(|| value.trim().parse::<usize>().ok())
                            .flatten()
                    })
                    .unwrap_or(0);
                if request.len() >= header_end + 4 + content_length {
                    break;
                }
            }

            tokio::time::sleep(delay).await;
            let reason = match status {
                200 => "OK",
                401 => "Unauthorized",
                403 => "Forbidden",
                429 => "Too Many Requests",
                500 => "Internal Server Error",
                504 => "Gateway Timeout",
                _ => "Mock Response",
            };
            let response = format!(
                "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                status,
                reason,
                content_type,
                response_body.len()
            );
            let _ = socket.write_all(response.as_bytes()).await;
            let _ = socket.write_all(&response_body).await;
            String::from_utf8_lossy(&request).to_string()
        });
        (format!("http://{}", address), task)
    }

    fn mock_provider(base_url: String, timeout: Duration) -> CloudflareWorkersAiProvider {
        CloudflareWorkersAiProvider {
            client: reqwest::Client::builder().timeout(timeout).build().unwrap(),
            api_base_url: base_url,
            account_id: "0123456789abcdef0123456789abcdef".to_string(),
            api_token: "mock-token".to_string(),
            model_en: MODEL_EN.to_string(),
            model_es: MODEL_ES.to_string(),
            speaker_en: "luna".to_string(),
            speaker_es: "aquila".to_string(),
        }
    }

    #[tokio::test]
    async fn calls_cloudflare_with_bearer_auth_and_language_model_selection() {
        let mp3 = BASE64_STANDARD.encode(b"ID3mock-mp3");
        let json = format!(r#"{{"success":true,"result":{{"audio":"{}"}}}}"#, mp3);
        let (base_url, server) = spawn_mock_response(
            200,
            "application/json",
            json.into_bytes(),
            Duration::ZERO,
        )
        .await;
        let provider = mock_provider(base_url, Duration::from_secs(2));
        let audio = provider.synthesize("Hola", "Lupe", "x-slow").await.unwrap();
        let request = server.await.unwrap();

        assert!(request.contains("authorization: bearer mock-token") || request.contains("Authorization: Bearer mock-token"));
        assert!(request.contains("/ai/run/@cf/deepgram/aura-2-es"));
        assert!(request.contains(r#""speaker":"aquila""#));
        assert!(request.contains(r#""encoding":"mp3""#));
        assert_eq!(audio.bytes, b"ID3mock-mp3");
        assert_eq!(audio.model, MODEL_ES);
        assert_eq!(audio.playback_rate, 0.65);
    }

    #[tokio::test]
    async fn maps_cloudflare_authentication_and_rate_limit_responses() {
        for (status, expected) in [
            (401, "provider_authentication"),
            (429, "rate_limited"),
        ] {
            let (base_url, server) = spawn_mock_response(
                status,
                "application/json",
                b"{\"success\":false}".to_vec(),
                Duration::ZERO,
            )
            .await;
            let provider = mock_provider(base_url, Duration::from_secs(2));
            let error = provider.synthesize("Hello", "Joanna", "").await.err().unwrap();
            let _request = server.await.unwrap();
            assert_eq!(error.category(), expected);
        }
    }

    #[tokio::test]
    async fn maps_cloudflare_timeout_without_credentials_or_network_access() {
        let (base_url, server) = spawn_mock_response(
            200,
            "application/json",
            b"{\"result\":{\"audio\":\"SUQ=\"}}".to_vec(),
            Duration::from_millis(100),
        )
        .await;
        let provider = mock_provider(base_url, Duration::from_millis(10));
        let error = provider.synthesize("Hello", "Joanna", "").await.err().unwrap();
        let _request = server.await.unwrap();
        assert_eq!(error.category(), "timeout");
    }
}
