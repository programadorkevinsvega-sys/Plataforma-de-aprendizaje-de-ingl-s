#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${EUID} -eq 0 ]] || { echo "Run with sudo/root." >&2; exit 1; }

APP_ROOT="/opt/apps/plataforma-aprendizaje"
APP_CONFIG="/etc/apps/plataforma-aprendizaje"
LEGACY_ROOT="/opt/devfluency"
LEGACY_CONFIG="/etc/devfluency/devfluency.env"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends ca-certificates curl tar

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x -o /tmp/nodesource_setup.sh
  bash /tmp/nodesource_setup.sh
  apt-get install -y nodejs
  rm -f /tmp/nodesource_setup.sh
fi

getent group devfluency >/dev/null || groupadd --system devfluency
id devfluency >/dev/null 2>&1 || useradd --system --gid devfluency --home-dir /var/lib/devfluency --shell /usr/sbin/nologin devfluency
id devfluency-phonetic >/dev/null 2>&1 || useradd --system --gid devfluency --home-dir /var/lib/devfluency-phonetic --shell /usr/sbin/nologin devfluency-phonetic
usermod --gid devfluency devfluency-phonetic

install -d -o root -g devfluency -m 0750 "$APP_ROOT" "$APP_ROOT/releases" "$APP_CONFIG"
install -d -o devfluency -g devfluency -m 0750 /var/lib/devfluency
install -d -o devfluency-phonetic -g devfluency -m 0750 /var/lib/devfluency-phonetic

# Preserve an existing installation when moving from the legacy single-app path.
if [[ -d "$LEGACY_ROOT/releases" ]] && [[ -z "$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  cp -a "$LEGACY_ROOT/releases/." "$APP_ROOT/releases/"
fi

if [[ ! -e "$APP_ROOT/current" && -L "$LEGACY_ROOT/current" ]]; then
  legacy_release="$(basename "$(readlink -f "$LEGACY_ROOT/current")")"
  if [[ -d "$APP_ROOT/releases/$legacy_release" ]]; then
    ln -s "$APP_ROOT/releases/$legacy_release" "$APP_ROOT/current"
  fi
fi

if [[ ! -f "$APP_CONFIG/plataforma-aprendizaje.env" ]]; then
  if [[ -s "$LEGACY_CONFIG" ]]; then
    install -o root -g devfluency -m 0640 "$LEGACY_CONFIG" "$APP_CONFIG/plataforma-aprendizaje.env"
  else
    cat > "$APP_CONFIG/plataforma-aprendizaje.env" <<'ENV'
# Complete this file on the VM. Never commit production secrets.
DATABASE_URL=
JWT_SECRET=
REDIS_URL=
NATS_URL=
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_POLLY_VOICE_ID=Matthew
AWS_TRANSCRIBE_LANGUAGE_CODE=en-US
CORS_ALLOWED_ORIGINS=https://app-ingles.jnmtortas.com
BFF_HTTP_BIND_ADDR=127.0.0.1:8080
AUTH_SERVICE_BIND_ADDR=127.0.0.1:50051
CONTENT_SERVICE_BIND_ADDR=127.0.0.1:50052
AI_SERVICE_BIND_ADDR=127.0.0.1:50053
PHONETIC_SERVICE_BIND_ADDR=127.0.0.1:50054
SRS_SERVICE_BIND_ADDR=127.0.0.1:50055
GAMIFICATION_SERVICE_BIND_ADDR=127.0.0.1:50056
ENV
    chmod 0640 "$APP_CONFIG/plataforma-aprendizaje.env"
    chown root:devfluency "$APP_CONFIG/plataforma-aprendizaje.env"
  fi
fi

# Keep TTS credentials and audio-only settings out of the shared environment
# consumed by every Rust service. Older deployments may still have these keys
# in the shared file, so migrate them once while preserving dedicated-file values.
AUDIO_CONFIG="$APP_CONFIG/phonetic-audio-service.env"
touch "$AUDIO_CONFIG"
# systemd reads EnvironmentFile as root; runtime services must not read this file.
chown root:root "$AUDIO_CONFIG"
chmod 0600 "$AUDIO_CONFIG"

is_audio_setting() {
  case "$1" in
    TTS_PROVIDER|AWS_POLLY_VOICE_ID|AWS_POLLY_TIMEOUT_SECONDS|AWS_TRANSCRIBE_LANGUAGE_CODE|CLOUDFLARE_ACCOUNT_ID|CLOUDFLARE_API_TOKEN|CLOUDFLARE_TTS_MODEL_EN|CLOUDFLARE_TTS_MODEL_ES|CLOUDFLARE_TTS_SPEAKER_EN|CLOUDFLARE_TTS_SPEAKER_ES|CLOUDFLARE_TTS_TIMEOUT_SECONDS)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

shared_config_tmp="$(mktemp)"
while IFS= read -r line || [[ -n "$line" ]]; do
  key=""
  if [[ "$line" =~ ^([A-Z][A-Z0-9_]*)= ]]; then
    key="${BASH_REMATCH[1]}"
  fi

  if [[ -n "$key" ]] && is_audio_setting "$key"; then
    # The dedicated file wins when both files define the same setting.
    if ! grep -q "^$key=" "$AUDIO_CONFIG"; then
      printf '%s\n' "$line" >> "$AUDIO_CONFIG"
    fi
    continue
  fi

  printf '%s\n' "$line" >> "$shared_config_tmp"
done < "$APP_CONFIG/plataforma-aprendizaje.env"
cat "$shared_config_tmp" > "$APP_CONFIG/plataforma-aprendizaje.env"
rm -f "$shared_config_tmp"

ensure_audio_default() {
  local key="$1"
  local value="$2"
  if ! grep -q "^$key=" "$AUDIO_CONFIG"; then
    printf '%s=%s\n' "$key" "$value" >> "$AUDIO_CONFIG"
  fi
}

ensure_audio_default TTS_PROVIDER aws
ensure_audio_default AWS_POLLY_VOICE_ID Matthew
ensure_audio_default AWS_POLLY_TIMEOUT_SECONDS 30
ensure_audio_default AWS_TRANSCRIBE_LANGUAGE_CODE en-US
ensure_audio_default CLOUDFLARE_ACCOUNT_ID ""
ensure_audio_default CLOUDFLARE_API_TOKEN ""
ensure_audio_default CLOUDFLARE_TTS_MODEL_EN @cf/deepgram/aura-2-en
ensure_audio_default CLOUDFLARE_TTS_MODEL_ES @cf/deepgram/aura-2-es
ensure_audio_default CLOUDFLARE_TTS_SPEAKER_EN luna
ensure_audio_default CLOUDFLARE_TTS_SPEAKER_ES aquila
ensure_audio_default CLOUDFLARE_TTS_TIMEOUT_SECONDS 30

chown root:root "$AUDIO_CONFIG"
chmod 0600 "$AUDIO_CONFIG"
chown root:devfluency "$APP_CONFIG/plataforma-aprendizaje.env"
chmod 0640 "$APP_CONFIG/plataforma-aprendizaje.env"

# Keep the production browser origin explicit on both fresh and existing VMs.
if grep -q '^CORS_ALLOWED_ORIGINS=' "$APP_CONFIG/plataforma-aprendizaje.env"; then
  sed -i 's|^CORS_ALLOWED_ORIGINS=.*$|CORS_ALLOWED_ORIGINS=https://app-ingles.jnmtortas.com|' "$APP_CONFIG/plataforma-aprendizaje.env"
else
  printf '%s\n' 'CORS_ALLOWED_ORIGINS=https://app-ingles.jnmtortas.com' >> "$APP_CONFIG/plataforma-aprendizaje.env"
fi
chown root:devfluency "$APP_CONFIG/plataforma-aprendizaje.env"
chmod 0640 "$APP_CONFIG/plataforma-aprendizaje.env"

install -m 0644 "$(dirname "$0")/systemd/devfluency@.service" /etc/systemd/system/devfluency@.service
install -m 0644 "$(dirname "$0")/systemd/devfluency.target" /etc/systemd/system/devfluency.target
install -d -m 0755 /etc/systemd/system/devfluency@phonetic-audio-service.service.d
cat > /etc/systemd/system/devfluency@phonetic-audio-service.service.d/identity.conf <<'UNIT'
[Service]
User=devfluency-phonetic
Group=devfluency
ReadWritePaths=/var/lib/devfluency-phonetic
UNIT
chmod 0644 /etc/systemd/system/devfluency@phonetic-audio-service.service.d/identity.conf
install -m 0644 "$(dirname "$0")/systemd/devfluency-frontend.service" /etc/systemd/system/devfluency-frontend.service
systemctl daemon-reload
systemctl enable devfluency.target devfluency-frontend.service

echo "Platform application systemd and Node.js configured."
echo "Verify DATABASE_URL and JWT_SECRET in $APP_CONFIG/plataforma-aprendizaje.env before first deployment."
echo "Configure TTS_PROVIDER and provider credentials only in $AUDIO_CONFIG."
