#!/usr/bin/env bash

# ==============================================================================
# DEVFLUENCY AI - SCRIPT DE COMPILACIÓN DE PRODUCCIÓN COMPLETA
# Compila todos los microservicios en Rust en modo Release y el Frontend Next.js
# Uso: ./build_all.sh [--clean]
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

FORCE_CLEAN=false
if [[ "${1:-}" == "--clean" ]] || [[ "${1:-}" == "-c" ]]; then
  FORCE_CLEAN=true
fi

echo "======================================================================"
echo "🚀 INICIANDO COMPILACIÓN ENTERPRISE DE PRODUCCIÓN DE DEVFLUENCY AI"
echo "======================================================================"
echo "📍 Directorio raíz: $SCRIPT_DIR"
echo ""

# 1. Cargar variables de entorno
if [ -f .env ]; then
  echo "🔒 Cargando variables de entorno desde .env..."
  set -a
  source .env
  set +a
else
  echo "⚠️ Advertencia: No se encontró el archivo .env. Asegúrate de configurarlo."
fi

# 2. Compilar Workspace de Rust en Modo Release
if [ "$FORCE_CLEAN" = true ]; then
  echo ""
  echo "🧹 Limpiando caché previa de Rust (cargo clean)..."
  cargo clean
fi

echo ""
echo "🦀 [1/2] Compilando Workspace de Rust (9 Crates) en Modo Release..."
cargo build --workspace --release

echo ""
echo "✅ Binarios de Rust compilados exitosamente en ./target/release/:"
ls -lh target/release/bff target/release/auth-identity-service target/release/content-vocabulary-service target/release/phonetic-audio-service target/release/ai-evaluator-service target/release/srs-engine-service target/release/gamification-progress-service 2>/dev/null || true

# 3. Compilar el Frontend Next.js con el gestor oficial del workspace (pnpm)
echo ""
echo "🎨 [2/2] Compilando Frontend Next.js para Producción..."
if ! command -v pnpm >/dev/null 2>&1; then
  echo "❌ pnpm 12.21.0 no está instalado. Instálalo según packageManager en package.json."
  exit 1
fi
if ! node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); process.exit(major === 26 && (minor > 13 || (minor === 13 && patch >= 1)) ? 0 : 1);'; then
  echo "❌ Se requiere Node.js 26.13.1 LTS o una versión posterior de la serie 26."
  exit 1
fi

if [[ ! -f pnpm-lock.yaml ]]; then
  echo "❌ Falta pnpm-lock.yaml; no se permite compilar con dependencias no bloqueadas."
  exit 1
fi

pnpm install --frozen-lockfile
pnpm --filter devfluency-frontend build

cd "$SCRIPT_DIR"

echo ""
echo "======================================================================"
echo "🎉 ¡COMPILACIÓN DE PRODUCCIÓN COMPLETADA AL 100% EXITO!"
echo "======================================================================"
echo "👉 Para ejecutar el sistema completo en producción, ejecuta:"
echo "   ./run_all.sh"
echo "======================================================================"
