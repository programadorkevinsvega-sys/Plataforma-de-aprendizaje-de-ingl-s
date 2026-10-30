fn main() -> Result<(), Box<dyn std::error::Error>> {
    tonic_build::configure().compile_protos(
        &[
            "../../proto/auth.proto",
            "../../proto/content.proto",
            "../../proto/ai_evaluator.proto",
            "../../proto/srs.proto",
            "../../proto/gamification.proto",
            "../../proto/phonetic_audio.proto",
        ],
        &["../../proto"],
    )?;
    Ok(())
}
