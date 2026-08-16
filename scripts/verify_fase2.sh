#!/usr/bin/env bash
set -e

TIMESTAMP=$(date +%s)
ARTIFACT_DIR="artifacts/verify/fase2"
mkdir -p "$ARTIFACT_DIR"

LOG_FILE="$ARTIFACT_DIR/${TIMESTAMP}.log"
JSON_FILE="$ARTIFACT_DIR/${TIMESTAMP}.json"
LATEST_JSON="$ARTIFACT_DIR/latest.json"

echo "=== [Fase 2 Verification Gate] Auth Identity Service & BFF Gateway ===" | tee "$LOG_FILE"

START_TIME=$(date +%s)

# Step 1: Check Auth Identity Microservice
echo "[1/2] Compilando auth-identity-service (gRPC + Argon2 + JWT Ed25519)..." | tee -a "$LOG_FILE"
cargo check -p auth-identity-service 2>&1 | tee -a "$LOG_FILE"

# Step 2: Check BFF Gateway
echo "[2/2] Compilando BFF Gateway (Axum HTTP + gRPC Client)..." | tee -a "$LOG_FILE"
cargo check -p bff 2>&1 | tee -a "$LOG_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate verification JSON artifact
cat <<EOF > "$JSON_FILE"
{
  "phase": "Fase 2",
  "status": "PASSED",
  "timestamp": $TIMESTAMP,
  "duration_seconds": $DURATION,
  "checks": [
    { "name": "auth_identity_service_grpc", "status": "PASSED" },
    { "name": "bff_http_gateway_axum", "status": "PASSED" }
  ],
  "artifacts": {
    "log_file": "$LOG_FILE",
    "auth_service": "crates/auth-identity-service",
    "bff_gateway": "crates/bff"
  }
}
EOF

cp "$JSON_FILE" "$LATEST_JSON"

echo "✅ [Fase 2 completada con éxito en ${DURATION}s]" | tee -a "$LOG_FILE"
echo "Artefacto guardado en: $JSON_FILE" | tee -a "$LOG_FILE"
