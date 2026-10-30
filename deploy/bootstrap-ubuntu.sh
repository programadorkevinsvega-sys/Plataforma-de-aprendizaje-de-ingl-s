#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${EUID} -eq 0 ]] || { echo "Run with sudo/root." >&2; exit 1; }

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
install -d -o root -g devfluency -m 0750 /opt/devfluency /opt/devfluency/releases
install -d -o root -g devfluency -m 0750 /etc/devfluency
install -d -o devfluency -g devfluency -m 0750 /var/lib/devfluency

if [[ ! -f /etc/devfluency/devfluency.env ]]; then
  cat > /etc/devfluency/devfluency.env <<'ENV'
# Complete this file once on the VM. Never commit production secrets.
DATABASE_URL=
JWT_SECRET=
REDIS_URL=
NATS_URL=
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
AWS_POLLY_VOICE_ID=Matthew
AWS_TRANSCRIBE_LANGUAGE_CODE=en-US
CORS_ALLOWED_ORIGINS=http://localhost:3000
BFF_HTTP_BIND_ADDR=127.0.0.1:8080
AUTH_SERVICE_BIND_ADDR=127.0.0.1:50051
CONTENT_SERVICE_BIND_ADDR=127.0.0.1:50052
AI_SERVICE_BIND_ADDR=127.0.0.1:50053
PHONETIC_SERVICE_BIND_ADDR=127.0.0.1:50054
SRS_SERVICE_BIND_ADDR=127.0.0.1:50055
GAMIFICATION_SERVICE_BIND_ADDR=127.0.0.1:50056
ENV
  chmod 0640 /etc/devfluency/devfluency.env
  chown root:devfluency /etc/devfluency/devfluency.env
fi

install -m 0644 "$(dirname "$0")/systemd/devfluency@.service" /etc/systemd/system/devfluency@.service
install -m 0644 "$(dirname "$0")/systemd/devfluency.target" /etc/systemd/system/devfluency.target
install -m 0644 "$(dirname "$0")/systemd/devfluency-frontend.service" /etc/systemd/system/devfluency-frontend.service
systemctl daemon-reload
systemctl enable devfluency.target devfluency-frontend.service

echo "Systemd and Node.js configured."
echo "Set DATABASE_URL and a strong JWT_SECRET in /etc/devfluency/devfluency.env before first start."
