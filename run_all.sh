#!/usr/bin/env bash

# ==============================================================================
# DEVFLUENCY AI - SCRIPT DE ARRANQUE SECUENCIAL ENTERPRISE CON HEALTH-CHECK
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================================"
echo "🚀 INICIANDO DEVFLUENCY AI (ARRANQUE SECUENCIAL CON HEALTH CHECKS)"
echo "======================================================================"

# 1. Cargar variables de entorno desde .env
if [ -f .env ]; then
  echo "🔒 Cargando variables de entorno desde .env..."
  set -a
  source .env
  set +a
else
  echo "❌ ERROR: El archivo .env no existe en $SCRIPT_DIR."
  exit 1
fi

export RUST_LOG=${RUST_LOG:-info}

# Lista de PIDs para apagar todo limpiamente al presionar Ctrl+C
PIDS=()

cleanup() {
  echo ""
  echo "🛑 DETENIENDO PROCESOS DE RUST Y FRONTEND..."
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "  - Apagando proceso PID $pid..."
      kill -TERM "$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
    fi
  done
  echo "✅ Todos los servicios fueron detenidos ordenadamente."
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

# Función de Health Check en tiempo real por puerto TCP
wait_for_port() {
  local port=$1
  local name=$2
  local timeout=15
  local count=0
  echo -n "  ⏳ Verificando Health Check para $name (Puerto $port)..."
  while true; do
    if (exec 3<>/dev/tcp/127.0.0.1/"$port") 2>/dev/null; then
      exec 3>&-
      exec 3<&-
      echo " ✅ READY"
      break
    fi
    sleep 0.3
    count=$((count + 1))
    if [ "$count" -ge "$((timeout * 3))" ]; then
      echo ""
      echo "❌ ERROR CRÍTICO: $name en puerto $port no respondió tras ${timeout}s."
      exit 1
    fi
  done
}

# 2. Localizar binarios de Producción en Release
BIN_DIR="$SCRIPT_DIR/target/release"

if [ ! -f "$BIN_DIR/bff" ]; then
  echo "⚠️ Binarios de release no encontrados en target/release/. Verificando modo debug..."
  BIN_DIR="$SCRIPT_DIR/target/debug"
  if [ ! -f "$BIN_DIR/bff" ]; then
    echo "⚙️ No se encontraron binarios previos. Compilando workspace en Release..."
    cargo build --workspace --release
    BIN_DIR="$SCRIPT_DIR/target/release"
  fi
fi

echo "📦 Binarios ejecutables localizados en: $BIN_DIR"

# 2.5 Ejecutar Migraciones SQL de PostgreSQL
echo ""
echo "⚙️ [Pass 1/3] Ejecutando Migraciones SQL en PostgreSQL..."
if [ -d "$SCRIPT_DIR/migrations" ]; then
  node -e '
  const fs = require("fs");
  const { Client } = require("pg");
  async function run() {
    const dbUrl = process.env.DATABASE_URL || "postgres://postgres:Kevins1612522026@127.0.0.1:5432/devfluency_db";
    const client = new Client({ connectionString: dbUrl });
    try {
      await client.connect();
      const files = fs.readdirSync("migrations").filter(f => f.endsWith(".sql")).sort();
      for (const file of files) {
        console.log(`  - Aplicando migración: ${file}`);
        const sql = fs.readFileSync(`migrations/${file}`, "utf8");
        await client.query(sql);
      }
      await client.end();
      console.log("  ✅ Todas las migraciones SQL fueron aplicadas.");
    } catch (e) {
      console.error("  ⚠️ Error conectando a PostgreSQL para migraciones:", e.message);
    }
  }
  run();
  ' || true
fi

# 3. Iniciar Microservicios gRPC en Orden Estricto con Readiness Probes
echo ""
echo "🦀 [Pass 2/3] Iniciando Microservicios gRPC Backend (Secuencial)..."

echo "  1. Auth Identity Service (gRPC :50051)"
("$BIN_DIR/auth-identity-service" 2>&1 | sed -u 's/^/[AUTH] /') &
PIDS+=($!)
wait_for_port 50051 "Auth Identity Service"

echo "  2. Content Vocabulary Service (gRPC :50052)"
("$BIN_DIR/content-vocabulary-service" 2>&1 | sed -u 's/^/[CONTENT] /') &
PIDS+=($!)
wait_for_port 50052 "Content Vocabulary Service"

echo "  3. AI Evaluator Service (gRPC :50053)"
("$BIN_DIR/ai-evaluator-service" 2>&1 | sed -u 's/^/[AI-EVAL] /') &
PIDS+=($!)
wait_for_port 50053 "AI Evaluator Service"

echo "  4. Phonetic Audio Service (gRPC :50054)"
("$BIN_DIR/phonetic-audio-service" 2>&1 | sed -u 's/^/[AUDIO] /') &
PIDS+=($!)
wait_for_port 50054 "Phonetic Audio Service"

echo "  5. SRS Engine Service (gRPC :50055)"
("$BIN_DIR/srs-engine-service" 2>&1 | sed -u 's/^/[SRS] /') &
PIDS+=($!)
wait_for_port 50055 "SRS Engine Service"

echo "  6. Gamification Progress Service (gRPC :50056)"
("$BIN_DIR/gamification-progress-service" 2>&1 | sed -u 's/^/[GAMIF] /') &
PIDS+=($!)
wait_for_port 50056 "Gamification Progress Service"

echo "  7. BFF Gateway HTTP (Puerto 8080)"
("$BIN_DIR/bff" 2>&1 | sed -u 's/^/[BFF-HTTP] /') &
PIDS+=($!)
wait_for_port 8080 "BFF Gateway HTTP"

# 4. Iniciar Frontend
echo ""
echo "🎨 [Pass 3/3] Iniciando Frontend Web..."
cd "$SCRIPT_DIR/frontend"

if command -v bun &> /dev/null; then
  echo "⚡ Ejecutando Frontend en puerto 3000..."
  (bun run start -p 3000 2>&1 | sed -u 's/^/[FRONTEND] /') &
  PIDS+=($!)
else
  echo "🌐 Ejecutando Frontend en puerto 3000..."
  (./node_modules/.bin/next start -p 3000 2>&1 | sed -u 's/^/[FRONTEND] /') &
  PIDS+=($!)
fi

cd "$SCRIPT_DIR"

echo ""
echo "======================================================================"
echo "✨ ¡SISTEMA DEVFLUENCY AI 100% OPERATIVO EN ORDEN ENTERPRISE!"
echo "======================================================================"
echo "🌐 Frontend Web:   http://localhost:3000"
echo "🔌 Gateway BFF:   http://localhost:8080"
echo "======================================================================"
echo "Todos los 7 servicios de backend pasaron su Health Check exitosamente."
echo "Presiona Ctrl+C para detener todo el clúster."
echo ""

# Mantener vivos los procesos
wait
