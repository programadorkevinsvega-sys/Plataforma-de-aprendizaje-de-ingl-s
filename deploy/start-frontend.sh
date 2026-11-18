#!/usr/bin/env bash
set -Eeuo pipefail

FRONTEND_ROOT="${DEVFLUENCY_FRONTEND_ROOT:-/opt/apps/plataforma-aprendizaje/current/frontend}"
NODE_BIN="${NODE_BINARY:-/usr/bin/node}"

if [[ -f "$FRONTEND_ROOT/server.js" ]]; then
  APP_DIR="$FRONTEND_ROOT"
elif [[ -f "$FRONTEND_ROOT/frontend/server.js" ]]; then
  # Next.js standalone output in this pnpm workspace is rooted one level
  # deeper because the tracing root is the repository workspace.
  APP_DIR="$FRONTEND_ROOT/frontend"
else
  echo "Cannot find Next.js standalone server.js under $FRONTEND_ROOT." >&2
  exit 1
fi

cd "$APP_DIR"
exec "$NODE_BIN" server.js
