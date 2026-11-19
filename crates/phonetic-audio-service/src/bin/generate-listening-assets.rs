use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine as _;
use chrono::Utc;
use proto::phonetic_audio::{
    phonetic_audio_service_client::PhoneticAudioServiceClient, SynthesizeRequest,
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    env,
    error::Error,
    fs,
    path::{Path, PathBuf},
    time::Duration,
};
use tonic::{transport::Channel, Request};

const DEFAULT_CATALOG: &str = "crates/content-vocabulary-service/data/lexical_catalog.v2.json";
const DEFAULT_ENDPOINT: &str = "http://127.0.0.1:50054";
const DEFAULT_OUTPUT_DIR: &str = "/tmp/devfluency-listening-audio";
const MAX_TEXT_CHARS: usize = 1_000;
const EXPECTED_LISTENING_ASSETS: usize = 13;

struct Options {
    catalog: PathBuf,
    output_dir: PathBuf,
    endpoint: String,
    voice: String,
    resource_ids: Vec<String>,
    apply: bool,
}

struct GeneratedAsset {
    manifest_entry: Value,
    file_name: String,
    bytes: Vec<u8>,
}

fn option_value(args: &[String], name: &str, fallback: String) -> Result<String, String> {
    match args.iter().position(|arg| arg == name) {
        Some(index) => args
            .get(index + 1)
            .filter(|value| !value.starts_with("--"))
            .cloned()
            .ok_or_else(|| format!("{name} requiere un valor.")),
        None => Ok(fallback),
    }
}

fn option_values(args: &[String], name: &str) -> Result<Vec<String>, String> {
    let mut values = Vec::new();
    for (index, argument) in args.iter().enumerate() {
        if argument == name {
            let value = args
                .get(index + 1)
                .filter(|value| !value.starts_with("--"))
                .cloned()
                .ok_or_else(|| format!("{name} requiere un valor."))?;
            values.push(value);
        }
    }
    Ok(values)
}

fn options() -> Result<Options, String> {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let apply = args.iter().any(|arg| arg == "--apply");
    if apply && args.iter().any(|arg| arg == "--dry-run") {
        return Err("Usa --apply o --dry-run, no ambos.".to_string());
    }
    let catalog = option_value(&args, "--catalog", DEFAULT_CATALOG.to_string())?;
    let output_dir = option_value(
        &args,
        "--output-dir",
        env::var("LISTENING_AUDIO_OUTPUT_DIR").unwrap_or_else(|_| DEFAULT_OUTPUT_DIR.to_string()),
    )?;
    let endpoint = option_value(
        &args,
        "--endpoint",
        env::var("TTS_SMOKE_ENDPOINT").unwrap_or_else(|_| DEFAULT_ENDPOINT.to_string()),
    )?;
    let voice = option_value(
        &args,
        "--voice",
        env::var("LISTENING_TTS_VOICE").unwrap_or_else(|_| "Matthew".to_string()),
    )?;
    let resource_ids = option_values(&args, "--resource-id")?;

    for argument in &args {
        if argument.starts_with("--")
            && ![
                "--apply",
                "--catalog",
                "--output-dir",
                "--endpoint",
                "--voice",
                "--resource-id",
                "--dry-run",
            ]
            .contains(&argument.as_str())
        {
            return Err(format!("Opción no reconocida: {argument}"));
        }
    }

    Ok(Options {
        catalog: PathBuf::from(catalog),
        output_dir: PathBuf::from(output_dir),
        endpoint,
        voice,
        resource_ids,
        apply,
    })
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn safe_asset_name(resource_id: &str) -> Result<String, String> {
    if resource_id.is_empty()
        || !resource_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(format!(
            "ID de recurso no válido para nombre de archivo: {resource_id}"
        ));
    }
    Ok(format!("{resource_id}.mp3"))
}

fn is_mp3(bytes: &[u8]) -> bool {
    bytes.len() >= 4
        && (bytes.starts_with(b"ID3") || (bytes[0] == 0xff && (bytes[1] & 0xe0) == 0xe0))
}

fn listening_resources(
    catalog: &Value,
    requested_ids: &[String],
) -> Result<Vec<Value>, Box<dyn Error>> {
    if catalog["format"] != "devfluency.lexical-catalog" || catalog["schema_version"] != 2 {
        return Err("Se requiere un catálogo léxico v2.".into());
    }
    let resources = catalog["comprehension_resources"]
        .as_array()
        .ok_or("El catálogo no contiene comprehension_resources.")?;
    let listening = resources
        .iter()
        .filter(|resource| resource["skill"] == "listening")
        .cloned()
        .collect::<Vec<_>>();
    if listening.len() != EXPECTED_LISTENING_ASSETS {
        return Err(format!(
            "Se esperaban {EXPECTED_LISTENING_ASSETS} guiones listening y se encontraron {}.",
            listening.len()
        )
        .into());
    }

    for resource in &listening {
        let id = resource["id"].as_str().unwrap_or_default();
        let content = resource["content"].as_str().unwrap_or_default();
        if id.is_empty() || content.trim().is_empty() {
            return Err(format!("Recurso listening incompleto: {id}").into());
        }
        if content.chars().count() > MAX_TEXT_CHARS {
            return Err(format!(
                "El recurso {id} supera el límite TTS de {MAX_TEXT_CHARS} caracteres."
            )
            .into());
        }
        if resource["transcript_available"] != false {
            return Err(format!("El transcript de listening debe seguir oculto: {id}").into());
        }
        if resource["publication_status"] == "published" {
            return Err(format!(
                "El recurso {id} está publicado; este generador solo crea assets pendientes y no sobrescribe contenido publicado."
            )
            .into());
        }
        if resource["audio"]["status"] == "approved" {
            return Err(
                format!("El recurso {id} ya tiene audio aprobado; no se sobrescribirá.").into(),
            );
        }
        safe_asset_name(id)?;
    }
    if requested_ids.is_empty() {
        return Ok(listening);
    }

    let mut selected_ids = HashSet::with_capacity(requested_ids.len());
    let mut selected = Vec::with_capacity(requested_ids.len());
    for requested_id in requested_ids {
        if !selected_ids.insert(requested_id.as_str()) {
            return Err(format!("El recurso listening se seleccionó más de una vez: {requested_id}").into());
        }
        let resource = listening
            .iter()
            .find(|resource| resource["id"].as_str() == Some(requested_id.as_str()))
            .cloned()
            .ok_or_else(|| format!("No existe un recurso listening con ID: {requested_id}"))?;
        selected.push(resource);
    }
    Ok(selected)
}

fn dry_run_report(resources: &[Value], options: &Options) -> Value {
    json!({
        "mode": "dry_run",
        "apply_required": true,
        "endpoint": options.endpoint,
        "voice": options.voice,
        "output_dir": options.output_dir.display().to_string(),
        "assets": resources.iter().map(|resource| json!({
            "resource_id": resource["id"],
            "track": resource["track"],
            "cefr_level": resource["cefr_level"],
            "title": resource["title"],
            "characters": resource["content"].as_str().unwrap_or_default().chars().count(),
            "transcript_available": resource["transcript_available"],
        })).collect::<Vec<_>>(),
    })
}

async fn synthesize_all(
    resources: &[Value],
    options: &Options,
) -> Result<Vec<GeneratedAsset>, Box<dyn Error>> {
    let endpoint = Channel::from_shared(options.endpoint.clone())?
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(90));
    let channel = endpoint.connect().await?;
    let mut client = PhoneticAudioServiceClient::new(channel);
    let expected_provider = env::var("TTS_PROVIDER")
        .ok()
        .map(|provider| provider.trim().to_ascii_lowercase());
    let mut observed_provider: Option<String> = None;

    let mut assets = Vec::with_capacity(resources.len());
    for resource in resources {
        let id = resource["id"].as_str().unwrap_or_default();
        let source_text = resource["content"].as_str().unwrap_or_default();
        let file_name = safe_asset_name(id)?;

        let response = client
            .synthesize_audio(Request::new(SynthesizeRequest {
                text: source_text.to_string(),
                voice: options.voice.clone(),
                rate: "medium".to_string(),
            }))
            .await?
            .into_inner();

        if response.format != "mp3" {
            return Err(format!(
                "El proveedor devolvió un formato inesperado para {id}: {}",
                response.format
            )
            .into());
        }
        if response.text != source_text {
            return Err(format!("El texto devuelto por TTS no coincide con el guion {id}.").into());
        }
        if response.model.trim().is_empty() || response.provider.trim().is_empty() {
            return Err(format!("Faltan metadatos de proveedor/modelo para {id}.").into());
        }
        if let Some(expected) = expected_provider.as_deref() {
            if response.provider.to_ascii_lowercase() != expected {
                return Err(format!(
                    "Proveedor TTS inesperado para {id}: se esperaba {expected} y se recibió {}.",
                    response.provider
                )
                .into());
            }
        }
        if let Some(first_provider) = observed_provider.as_deref() {
            if response.provider != first_provider {
                return Err("El proveedor TTS cambió durante la generación del lote.".into());
            }
        } else {
            observed_provider = Some(response.provider.clone());
        }

        let audio = BASE64_STANDARD.decode(&response.audio_base64)?;
        if !is_mp3(&audio) {
            return Err(format!("El archivo generado para {id} no parece ser MP3 válido.").into());
        }

        let transcript_bytes = source_text.as_bytes();
        let audio_bytes = audio.len();
        let manifest_entry = json!({
            "resource_id": id,
            "title": resource["title"],
            "track": resource["track"],
            "cefr_level": resource["cefr_level"],
            "skill": "listening",
            "asset_file": file_name,
            "public_url_candidate": format!("/audio/listening/{file_name}"),
            "format": "mp3",
            "audio_bytes": audio_bytes,
            "audio_sha256": sha256(&audio),
            "source_text_sha256": sha256(transcript_bytes),
            "provider": response.provider,
            "model": response.model,
            "voice": response.voice,
            "playback_rate": response.playback_rate,
            "accent_reference": "en-US",
            "status": "generated_pending_audio_review",
            "audio_review": {
                "status": "pending_human_listening_review",
                "reviewer": null,
                "reviewed_at": null,
                "notes": null
            },
            "license_review": {
                "status": "pending_provider_terms_review"
            }
        });
        assets.push(GeneratedAsset {
            manifest_entry,
            file_name,
            bytes: audio,
        });
        println!("Generated listening asset: {id} ({audio_bytes} bytes)");
    }
    Ok(assets)
}

fn persist_assets(
    assets: &[GeneratedAsset],
    options: &Options,
    source_catalog_sha256: &str,
) -> Result<Value, Box<dyn Error>> {
    if options.output_dir.exists() {
        return Err(format!(
            "El directorio de salida ya existe: {}. Elige otro directorio para evitar sobrescribir archivos.",
            options.output_dir.display()
        )
        .into());
    }
    let parent = options
        .output_dir
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let directory_name = options
        .output_dir
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("El directorio de salida necesita un nombre válido.")?;
    let staging_dir = parent.join(format!(".{directory_name}-staging-{}", std::process::id()));
    if staging_dir.exists() {
        return Err(format!(
            "El directorio temporal ya existe: {}",
            staging_dir.display()
        )
        .into());
    }
    fs::create_dir(&staging_dir)?;

    let generated = (|| -> Result<Value, Box<dyn Error>> {
        for asset in assets {
            fs::write(staging_dir.join(&asset.file_name), &asset.bytes)?;
        }
        let provider = assets
            .first()
            .and_then(|asset| asset.manifest_entry["provider"].as_str())
            .unwrap_or("unknown");
        let manifest = json!({
            "format": "devfluency.listening-audio-manifest",
            "schema_version": 1,
            "generated_at": Utc::now().to_rfc3339(),
            "source_catalog_sha256": source_catalog_sha256,
            "provider": provider,
            "voice": options.voice,
            "accent_reference": "en-US",
            "editorial_status": "generated_pending_audio_review",
            "assets": assets.iter().map(|asset| asset.manifest_entry.clone()).collect::<Vec<_>>(),
        });
        fs::write(
            staging_dir.join("listening-audio-manifest.v1.json"),
            serde_json::to_vec_pretty(&manifest)?,
        )?;
        Ok(manifest)
    })();

    let manifest = match generated {
        Ok(manifest) => manifest,
        Err(error) => {
            let _ = fs::remove_dir_all(&staging_dir);
            return Err(error);
        }
    };
    if let Err(error) = fs::rename(&staging_dir, &options.output_dir) {
        let _ = fs::remove_dir_all(&staging_dir);
        return Err(error.into());
    }
    Ok(manifest)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let options = options().map_err(|message| {
        format!("{message}\nUso: generate-listening-assets [--dry-run|--apply] [--catalog PATH] [--resource-id ID ...] [--endpoint URL] [--voice VOICE] [--output-dir DIR]")
    })?;
    let catalog_bytes = fs::read(&options.catalog)?;
    let catalog_sha256 = sha256(&catalog_bytes);
    let catalog: Value = serde_json::from_slice(&catalog_bytes)?;
    let resources = listening_resources(&catalog, &options.resource_ids)?;

    if !options.apply {
        println!(
            "{}",
            serde_json::to_string_pretty(&dry_run_report(&resources, &options))?
        );
        return Ok(());
    }
    if options.output_dir.exists() {
        return Err(format!(
            "El directorio de salida ya existe: {}. Elige un directorio nuevo antes de sintetizar.",
            options.output_dir.display()
        )
        .into());
    }

    let assets = synthesize_all(&resources, &options).await?;
    let manifest = persist_assets(&assets, &options, &catalog_sha256)?;
    println!(
        "{}",
        serde_json::to_string_pretty(&json!({
            "mode": "apply",
            "output_dir": options.output_dir.display().to_string(),
            "assets_generated": assets.len(),
            "editorial_status": "generated_pending_audio_review",
            "manifest": manifest,
        }))?
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{is_mp3, safe_asset_name};

    #[test]
    fn real_catalog_has_thirteen_hidden_listening_scripts_within_the_tts_limit() {
        let catalog_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../content-vocabulary-service/data/lexical_catalog.v2.json");
        let bytes = std::fs::read(catalog_path).expect("lexical catalog v2 must exist");
        let catalog: serde_json::Value =
            serde_json::from_slice(&bytes).expect("lexical catalog v2 must be valid JSON");
        let resources =
            super::listening_resources(&catalog, &[]).expect("listening scripts must validate");
        assert_eq!(resources.len(), 13);
        assert!(resources.iter().all(|resource| {
            resource["transcript_available"] == false
                && resource["content"]
                    .as_str()
                    .is_some_and(|text| text.chars().count() <= super::MAX_TEXT_CHARS)
        }));
    }

    #[test]
    fn selects_only_the_requested_pre_a1_and_a1_listening_resources() {
        let catalog_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../content-vocabulary-service/data/lexical_catalog.v2.json");
        let bytes = std::fs::read(catalog_path).expect("lexical catalog v2 must exist");
        let catalog: serde_json::Value =
            serde_json::from_slice(&bytes).expect("lexical catalog v2 must be valid JSON");
        let requested = vec![
            "general-pre_a1-listening-02".to_string(),
            "general-a1-listening-04".to_string(),
        ];
        let resources = super::listening_resources(&catalog, &requested)
            .expect("requested initial listening resources must exist");
        assert_eq!(resources.len(), 2);
        assert_eq!(resources[0]["id"], requested[0]);
        assert_eq!(resources[1]["id"], requested[1]);
    }

    #[test]
    fn rejects_unknown_or_duplicate_listening_resource_selection() {
        let catalog_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../content-vocabulary-service/data/lexical_catalog.v2.json");
        let bytes = std::fs::read(catalog_path).expect("lexical catalog v2 must exist");
        let catalog: serde_json::Value =
            serde_json::from_slice(&bytes).expect("lexical catalog v2 must be valid JSON");
        assert!(super::listening_resources(&catalog, &["missing-id".to_string()]).is_err());
        assert!(super::listening_resources(
            &catalog,
            &[
                "general-pre_a1-listening-02".to_string(),
                "general-pre_a1-listening-02".to_string(),
            ],
        ).is_err());
    }

    #[test]
    fn accepts_stable_catalog_ids_as_asset_names() {
        assert_eq!(
            safe_asset_name("general-pre_a1-listening-02").unwrap(),
            "general-pre_a1-listening-02.mp3"
        );
    }

    #[test]
    fn rejects_path_traversal_in_asset_ids() {
        assert!(safe_asset_name("../../private").is_err());
        assert!(safe_asset_name("id/child").is_err());
    }

    #[test]
    fn accepts_mp3_id3_and_mpeg_frame_headers() {
        assert!(is_mp3(b"ID3\x04\x00\x00\x00\x00\x00\x10"));
        assert!(is_mp3(&[0xff, 0xfb, 0x90, 0x64]));
        assert!(!is_mp3(b"not-mp3"));
    }
}
