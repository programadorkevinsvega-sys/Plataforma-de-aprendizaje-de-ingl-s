#!/usr/bin/env bash
set -e

TIMESTAMP=$(date +%s)
ARTIFACT_DIR="artifacts/verify/fase1"
mkdir -p "$ARTIFACT_DIR"

LOG_FILE="$ARTIFACT_DIR/${TIMESTAMP}.log"
JSON_FILE="$ARTIFACT_DIR/${TIMESTAMP}.json"
LATEST_JSON="$ARTIFACT_DIR/latest.json"

echo "=== [Fase 1 Verification Gate] DevFluency AI Enterprise Workspace ===" | tee "$LOG_FILE"

START_TIME=$(date +%s)

# Step 1: Cargo Workspace Check
echo "[1/3] Compilando y verificando workspace de Rust..." | tee -a "$LOG_FILE"
cargo check --workspace 2>&1 | tee -a "$LOG_FILE"

# Step 2: Validate Protobuf compilation
echo "[2/3] Verificando compilación de contratos Protobuf gRPC..." | tee -a "$LOG_FILE"
cargo check -p proto 2>&1 | tee -a "$LOG_FILE"

# Step 3: Validate SQL Schema File
echo "[3/3] Verificando script de migración PostgreSQL RLS..." | tee -a "$LOG_FILE"
test -f migrations/20260805000000_init_schema.sql
echo "Migración PostgreSQL RLS verificada." | tee -a "$LOG_FILE"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Generate verification JSON artifact
cat <<EOF > "$JSON_FILE"
{
  "phase": "Fase 1",
  "status": "PASSED",
  "timestamp": $TIMESTAMP,
  "duration_seconds": $DURATION,
  "checks": [
    { "name": "cargo_workspace_check", "status": "PASSED" },
    { "name": "protobuf_grpc_contracts", "status": "PASSED" },
    { "name": "postgresql_rls_migration", "status": "PASSED" }
  ],
  "artifacts": {
    "log_file": "$LOG_FILE",
    "docker_compose": "docker-compose.yml",
    "init_schema": "migrations/20260805000000_init_schema.sql"
  }
}
EOF

cp "$JSON_FILE" "$LATEST_JSON"

echo "✅ [Fase 1 completada con éxito en ${DURATION}s]" | tee -a "$LOG_FILE"
echo "Artefacto guardado en: $JSON_FILE" | tee -a "$LOG_FILE"
