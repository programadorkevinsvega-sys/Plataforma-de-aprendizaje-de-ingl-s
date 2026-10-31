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

install -d -o root -g devfluency -m 0750 "$APP_ROOT" "$APP_ROOT/releases" "$APP_CONFIG"
install -d -o devfluency -g devfluency -m 0750 /var/lib/devfluency

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
install -m 0644 "$(dirname "$0")/systemd/devfluency-frontend.service" /etc/systemd/system/devfluency-frontend.service
systemctl daemon-reload
systemctl enable devfluency.target devfluency-frontend.service

echo "Platform application systemd and Node.js configured."
echo "Verify DATABASE_URL and JWT_SECRET in $APP_CONFIG/plataforma-aprendizaje.env before first deployment."
