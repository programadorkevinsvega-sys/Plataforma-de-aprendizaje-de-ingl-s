#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%s)
ARTIFACT_DIR="artifacts/verify/fase5"
mkdir -p "$ARTIFACT_DIR"

LOG_FILE="$ARTIFACT_DIR/${TIMESTAMP}.log"
JSON_FILE="$ARTIFACT_DIR/${TIMESTAMP}.json"
LATEST_JSON="$ARTIFACT_DIR/latest.json"

echo "=== [Fase 5 Verification Gate] Anki SM-2 SRS & Gamification Engine ===" | tee "$LOG_FILE"

START_TIME=$(date +%s)

# Step 1: Unit Tests for Anki SM-2 Algorithm
echo "[1/2] Ejecutando pruebas unitarias del Algoritmo Anki SM-2..." | tee -a "$LOG_FILE"
cargo test -p srs-engine-service 2>&1 | tee -a "$LOG_FILE"

# Step 2: Unit Tests for Gamification & Progress
echo "[2/2] Ejecutando pruebas unitarias de Gamificación (XP, Rachas, Niveles)..." | tee -a "$LOG_FILE"
cargo test -p gamification-progress-service 2>&1 | tee -a "$LOG_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate verification JSON artifact
cat <<EOF > "$JSON_FILE"
{
  "phase": "Fase 5",
  "status": "PASSED",
  "timestamp": $TIMESTAMP,
  "duration_seconds": $DURATION,
  "checks": [
    { "name": "anki_sm2_algorithm_tests", "status": "PASSED" },
    { "name": "gamification_xp_streak_tests", "status": "PASSED" }
  ],
  "artifacts": {
    "log_file": "$LOG_FILE",
    "srs_domain": "crates/srs-engine-service/src/domain.rs",
    "gamification_domain": "crates/gamification-progress-service/src/domain.rs"
  }
}
EOF

cp "$JSON_FILE" "$LATEST_JSON"

echo "✅ [Fase 5 completada con éxito en ${DURATION}s]" | tee -a "$LOG_FILE"
echo "Artefacto guardado en: $JSON_FILE" | tee -a "$LOG_FILE"
