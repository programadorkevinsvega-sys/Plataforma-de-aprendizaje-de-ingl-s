#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%s)
ARTIFACT_DIR="artifacts/verify/fase4"
mkdir -p "$ARTIFACT_DIR"

LOG_FILE="$ARTIFACT_DIR/${TIMESTAMP}.log"
JSON_FILE="$ARTIFACT_DIR/${TIMESTAMP}.json"
LATEST_JSON="$ARTIFACT_DIR/latest.json"

echo "=== [Fase 4 Verification Gate] AI Evaluator Engine & 6-Metric Exam Matrix ===" | tee "$LOG_FILE"

START_TIME=$(date +%s)

# Step 1: Unit Tests for 6-Metric Matrix & Weakness Isolator
echo "[1/2] Ejecutando pruebas unitarias de la Matriz de 6 Métricas e IA (90% Pass Rate Target)..." | tee -a "$LOG_FILE"
cargo test -p ai-evaluator-service 2>&1 | tee -a "$LOG_FILE"

# Step 2: Check AI Evaluator gRPC Service
echo "[2/2] Compilando ai-evaluator-service (Simulador Reclutador IA)..." | tee -a "$LOG_FILE"
cargo check -p ai-evaluator-service 2>&1 | tee -a "$LOG_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate verification JSON artifact
cat <<EOF > "$JSON_FILE"
{
  "phase": "Fase 4",
  "status": "PASSED",
  "timestamp": $TIMESTAMP,
  "duration_seconds": $DURATION,
  "checks": [
    { "name": "exam_6_metrics_unit_tests", "status": "PASSED" },
    { "name": "ai_evaluator_service_grpc", "status": "PASSED" }
  ],
  "artifacts": {
    "log_file": "$LOG_FILE",
    "evaluator_domain": "crates/ai-evaluator-service/src/domain.rs",
    "evaluator_service": "crates/ai-evaluator-service/src/service.rs"
  }
}
EOF

cp "$JSON_FILE" "$LATEST_JSON"

echo "✅ [Fase 4 completada con éxito en ${DURATION}s]" | tee -a "$LOG_FILE"
echo "Artefacto guardado en: $JSON_FILE" | tee -a "$LOG_FILE"
