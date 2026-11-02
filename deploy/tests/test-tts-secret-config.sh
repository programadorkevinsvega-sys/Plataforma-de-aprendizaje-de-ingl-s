#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
# shellcheck source=deploy/lib/tts-secret-config.sh
source "$ROOT/deploy/lib/tts-secret-config.sh"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
shared="$tmp/shared.env"
secrets="$tmp/phonetic-audio-service.secrets"

cat > "$shared" <<'ENV'
DATABASE_URL=postgres://localhost/aprendizaje_ingles
CLOUDFLARE_API_TOKEN=old-token
CLOUDFLARE_API_TOKEN=latest-token
ENV
cat > "$secrets" <<'ENV'
OTHER_AUDIO_SECRET=preserve-me
CLOUDFLARE_API_TOKEN=previous-token
ENV

migrate_cloudflare_api_token "$shared" "$secrets"

if grep -q '^CLOUDFLARE_API_TOKEN=' "$shared"; then
  echo "FAIL: Cloudflare token remained in the shared environment." >&2
  exit 1
fi
grep -Fxq 'CLOUDFLARE_API_TOKEN=latest-token' "$secrets"
grep -Fxq 'OTHER_AUDIO_SECRET=preserve-me' "$secrets"
[[ "$(stat -c '%a' "$secrets")" == "600" ]]

# The helper is idempotent and keeps the already-scoped token when the shared
# config no longer contains the variable.
migrate_cloudflare_api_token "$shared" "$secrets"
grep -Fxq 'CLOUDFLARE_API_TOKEN=latest-token' "$secrets"

unit="$ROOT/deploy/systemd/devfluency@.service"
dropin="$ROOT/deploy/systemd/devfluency@phonetic-audio-service.service.d/10-tts-secrets.conf"
if grep -q 'CLOUDFLARE_API_TOKEN' "$unit"; then
  echo "FAIL: The shared Rust systemd template mentions the Cloudflare token." >&2
  exit 1
fi
grep -Fq 'EnvironmentFile=/etc/apps/plataforma-aprendizaje/phonetic-audio-service.secrets' "$dropin"
grep -Fq 'User=devfluency-audio' "$dropin"
grep -Fq 'Group=devfluency' "$dropin"

smoke_unit="$ROOT/deploy/systemd/devfluency-tts-smoke.service"
grep -Fq 'User=devfluency-audio' "$smoke_unit"
grep -Fq 'EnvironmentFile=/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env' "$smoke_unit"
grep -Fq 'EnvironmentFile=/etc/apps/plataforma-aprendizaje/phonetic-audio-service.secrets' "$smoke_unit"
grep -Fq -- '--smoke-test-tts' "$smoke_unit"
grep -Fq 'id devfluency-audio' "$ROOT/deploy/bootstrap-ubuntu.sh"
grep -Fq 'systemctl start devfluency-tts-smoke.service' "$ROOT/deploy/deploy-release.sh"
grep -Fq -- '--smoke-test-tts' "$ROOT/crates/phonetic-audio-service/src/main.rs"

echo "TTS secret isolation tests passed."
