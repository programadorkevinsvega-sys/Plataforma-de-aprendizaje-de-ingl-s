#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%s)
ARTIFACT_DIR="artifacts/verify/fase3"
mkdir -p "$ARTIFACT_DIR"

LOG_FILE="$ARTIFACT_DIR/${TIMESTAMP}.log"
JSON_FILE="$ARTIFACT_DIR/${TIMESTAMP}.json"
LATEST_JSON="$ARTIFACT_DIR/latest.json"

echo "=== [Fase 3 Verification Gate] Spanish Phonetic Engine & Contextual Vocabulary ===" | tee "$LOG_FILE"

START_TIME=$(date +%s)

# Step 1: Unit Tests for Spanish Phonetic Engine
echo "[1/2] Ejecutando pruebas unitarias del Motor Fonético en Español (Sin IPA)..." | tee -a "$LOG_FILE"
cargo test -p phonetic-audio-service 2>&1 | tee -a "$LOG_FILE"

# Step 2: Check Content Vocabulary gRPC Service
echo "[2/2] Compilando content-vocabulary-service (Vocabulario en Contexto 3-5 oraciones)..." | tee -a "$LOG_FILE"
cargo check -p content-vocabulary-service 2>&1 | tee -a "$LOG_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate verification JSON artifact
cat <<EOF > "$JSON_FILE"
{
  "phase": "Fase 3",
  "status": "PASSED",
  "timestamp": $TIMESTAMP,
  "duration_seconds": $DURATION,
  "checks": [
    { "name": "spanish_phonetic_engine_tests", "status": "PASSED" },
    { "name": "content_vocabulary_service_grpc", "status": "PASSED" }
  ],
  "artifacts": {
    "log_file": "$LOG_FILE",
    "phonetic_engine": "crates/phonetic-audio-service/src/transliteration.rs",
    "content_service": "crates/content-vocabulary-service/src/service.rs"
  }
}
EOF

cp "$JSON_FILE" "$LATEST_JSON"

echo "✅ [Fase 3 completada con éxito en ${DURATION}s]" | tee -a "$LOG_FILE"
echo "Artefacto guardado en: $JSON_FILE" | tee -a "$LOG_FILE"
