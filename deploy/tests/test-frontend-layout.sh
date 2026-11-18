#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/frontend-layout.sh
source "$SCRIPT_DIR/../lib/frontend-layout.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/legacy" "$tmp/workspace/frontend"
touch "$tmp/legacy/server.js" "$tmp/workspace/frontend/server.js"

[[ "$(frontend_server_path "$tmp/legacy")" == "$tmp/legacy/server.js" ]]
[[ "$(frontend_server_path "$tmp/workspace")" == "$tmp/workspace/frontend/server.js" ]]

mkdir -p "$tmp/missing"
if frontend_server_path "$tmp/missing" >/dev/null; then
  echo "A frontend package without server.js was accepted." >&2
  exit 1
fi

echo "Frontend standalone layout resolution tests passed."
