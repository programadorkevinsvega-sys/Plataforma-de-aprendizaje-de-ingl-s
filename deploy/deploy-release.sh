#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${EUID} -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
[[ $# -eq 2 ]] || { echo "Usage: $0 <git-sha> <release-tarball>" >&2; exit 2; }
sha="$1"; archive="$2"
[[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || { echo "Invalid commit SHA" >&2; exit 2; }
[[ -f "$archive" ]] || { echo "Release archive not found" >&2; exit 2; }
[[ -s /etc/devfluency/devfluency.env ]] || { echo "Missing /etc/devfluency/devfluency.env" >&2; exit 1; }
grep -Eq '^DATABASE_URL=.+

release="/opt/devfluency/releases/$sha"
previous="$(readlink -f /opt/devfluency/current 2>/dev/null || true)"
install -d -o root -g devfluency -m 0750 "$release"
tar -xzf "$archive" -C "$release"
for binary in bff auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service; do
  test -x "$release/bin/$binary"
done
test -f "$release/frontend/server.js"
chown -R root:devfluency "$release"
find "$release" -type d -exec chmod 0750 {} +
find "$release/bin" -type f -exec chmod 0750 {} +
find "$release/frontend" -type f -exec chmod 0640 {} +
chmod 0750 "$release/frontend/server.js"

ln -sfn "$release" /opt/devfluency/current.next
mv -Tf /opt/devfluency/current.next /opt/devfluency/current

rollback() {
  echo "Health check failed; rolling back." >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -sfn "$previous" /opt/devfluency/current.rollback
    mv -Tf /opt/devfluency/current.rollback /opt/devfluency/current
    systemctl restart devfluency.target devfluency-frontend.service || true
  else
    systemctl stop devfluency.target devfluency-frontend.service || true
  fi
  exit 1
}

systemctl daemon-reload
for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
  systemctl restart "devfluency@${service}.service"
done
systemctl restart devfluency-frontend.service
for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
  systemctl is-active --quiet "devfluency@${service}.service" || rollback
done
for port in 50051 50052 50053 50054 50055 50056 8080; do
  ready=0
  for _ in $(seq 1 30); do
    if timeout 1 bash -c ":</dev/tcp/127.0.0.1/$port" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" -eq 1 ]] || rollback
done
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null && curl -fsS http://127.0.0.1:3000/ >/dev/null; then
    echo "Deployment $sha healthy."
    exit 0
  fi
  sleep 1
done
rollback
 /etc/devfluency/devfluency.env || { echo "Set DATABASE_URL in /etc/devfluency/devfluency.env before deploying." >&2; exit 1; }
grep -Eq '^JWT_SECRET=.{32,}

release="/opt/devfluency/releases/$sha"
previous="$(readlink -f /opt/devfluency/current 2>/dev/null || true)"
install -d -o root -g devfluency -m 0750 "$release"
tar -xzf "$archive" -C "$release"
for binary in bff auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service; do
  test -x "$release/bin/$binary"
done
test -f "$release/frontend/server.js"
chown -R root:devfluency "$release"
find "$release" -type d -exec chmod 0750 {} +
find "$release/bin" -type f -exec chmod 0750 {} +
find "$release/frontend" -type f -exec chmod 0640 {} +
chmod 0750 "$release/frontend/server.js"

ln -sfn "$release" /opt/devfluency/current.next
mv -Tf /opt/devfluency/current.next /opt/devfluency/current

rollback() {
  echo "Health check failed; rolling back." >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -sfn "$previous" /opt/devfluency/current.rollback
    mv -Tf /opt/devfluency/current.rollback /opt/devfluency/current
    systemctl restart devfluency.target devfluency-frontend.service || true
  else
    systemctl stop devfluency.target devfluency-frontend.service || true
  fi
  exit 1
}

systemctl daemon-reload
for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
  systemctl restart "devfluency@${service}.service"
done
systemctl restart devfluency-frontend.service
for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
  systemctl is-active --quiet "devfluency@${service}.service" || rollback
done
for port in 50051 50052 50053 50054 50055 50056 8080; do
  ready=0
  for _ in $(seq 1 30); do
    if timeout 1 bash -c ":</dev/tcp/127.0.0.1/$port" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" -eq 1 ]] || rollback
done
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null && curl -fsS http://127.0.0.1:3000/ >/dev/null; then
    echo "Deployment $sha healthy."
    exit 0
  fi
  sleep 1
done
rollback
 /etc/devfluency/devfluency.env || { echo "Set JWT_SECRET (at least 32 characters) in /etc/devfluency/devfluency.env before deploying." >&2; exit 1; }

release="/opt/devfluency/releases/$sha"
previous="$(readlink -f /opt/devfluency/current 2>/dev/null || true)"
install -d -o root -g devfluency -m 0750 "$release"
tar -xzf "$archive" -C "$release"
for binary in bff auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service; do
  test -x "$release/bin/$binary"
done
test -f "$release/frontend/server.js"
chown -R root:devfluency "$release"
find "$release" -type d -exec chmod 0750 {} +
find "$release/bin" -type f -exec chmod 0750 {} +
find "$release/frontend" -type f -exec chmod 0640 {} +
chmod 0750 "$release/frontend/server.js"

ln -sfn "$release" /opt/devfluency/current.next
mv -Tf /opt/devfluency/current.next /opt/devfluency/current

rollback() {
  echo "Health check failed; rolling back." >&2
  if [[ -n "$previous" && -d "$previous" ]]; then
    ln -sfn "$previous" /opt/devfluency/current.rollback
    mv -Tf /opt/devfluency/current.rollback /opt/devfluency/current
    systemctl restart devfluency.target devfluency-frontend.service || true
  else
    systemctl stop devfluency.target devfluency-frontend.service || true
  fi
  exit 1
}

systemctl daemon-reload
for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
  systemctl restart "devfluency@${service}.service"
done
systemctl restart devfluency-frontend.service
for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
  systemctl is-active --quiet "devfluency@${service}.service" || rollback
done
for port in 50051 50052 50053 50054 50055 50056 8080; do
  ready=0
  for _ in $(seq 1 30); do
    if timeout 1 bash -c ":</dev/tcp/127.0.0.1/$port" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" -eq 1 ]] || rollback
done
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:8080/health >/dev/null && curl -fsS http://127.0.0.1:3000/ >/dev/null; then
    echo "Deployment $sha healthy."
    exit 0
  fi
  sleep 1
done
rollback
