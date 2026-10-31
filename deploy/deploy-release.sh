#!/usr/bin/env bash
set -Eeuo pipefail
[[ ${EUID} -eq 0 ]] || { echo "Run with sudo." >&2; exit 1; }
[[ $# -eq 2 ]] || { echo "Usage: $0 <git-sha> <release-tarball>" >&2; exit 2; }
sha="$1"
archive="$2"
[[ "$sha" =~ ^[0-9a-f]{7,40}$ ]] || { echo "Invalid commit SHA" >&2; exit 2; }
[[ -f "$archive" ]] || { echo "Release archive not found" >&2; exit 2; }

APP_ROOT="/opt/apps/plataforma-aprendizaje"
APP_CONFIG="/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env"
RELEASES_ROOT="$APP_ROOT/releases"
[[ -s "$APP_CONFIG" ]] || { echo "Missing $APP_CONFIG" >&2; exit 1; }
grep -Eq "^DATABASE_URL=.+$" "$APP_CONFIG" || { echo "Set DATABASE_URL in $APP_CONFIG before deploying." >&2; exit 1; }
grep -Eq "^JWT_SECRET=.{32,}$" "$APP_CONFIG" || { echo "Set JWT_SECRET (at least 32 characters) in $APP_CONFIG before deploying." >&2; exit 1; }

install -d -o root -g devfluency -m 0750 "$RELEASES_ROOT"
release="$RELEASES_ROOT/$sha"
current="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"

# Determine a rollback target before changing current. If this SHA is already
# active, select the newest different release instead of rolling back to itself.
previous=""
if [[ -n "$current" && "$current" != "$release" && -d "$current" ]]; then
  previous="$current"
else
  mapfile -t prior_releases < <(
    find "$RELEASES_ROOT" -mindepth 1 -maxdepth 1 -type d ! -path "$release" -printf '%T@ %p\n' | sort -rn
  )
  if [[ ${#prior_releases[@]} -gt 0 ]]; then
    previous="${prior_releases[0]#* }"
  fi
fi

# Releases are immutable per commit SHA. Extract into a staging directory so
# a failed extraction never damages an existing release/current deployment.
stage="$(mktemp -d "$RELEASES_ROOT/.staging-${sha}.XXXXXX")"
cleanup_stage() {
  if [[ -n "${stage:-}" && -d "$stage" ]]; then rm -rf -- "$stage"; fi
}
trap cleanup_stage EXIT
tar -xzf "$archive" -C "$stage"
for binary in bff auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service; do
  test -x "$stage/bin/$binary"
done
test -f "$stage/frontend/server.js"
chown -R root:devfluency "$stage"
find "$stage" -type d -exec chmod 0750 {} +
find "$stage/bin" -type f -exec chmod 0750 {} +
find "$stage/frontend" -type f -exec chmod 0640 {} +
chmod 0750 "$stage/frontend/server.js"

if [[ -e "$release" ]]; then
  echo "Release $sha already exists; reusing immutable release."
  rm -rf -- "$stage"
  stage=""
else
  mv "$stage" "$release"
  stage=""
fi

restart_stack() {
  local service
  for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
    systemctl restart "devfluency@${service}.service"
  done
  systemctl restart devfluency-frontend.service
}

rollback() {
  echo "Deployment failed; rolling back Plataforma de Aprendizaje." >&2
  if [[ -n "$previous" && "$previous" != "$release" && -d "$previous" ]]; then
    ln -sfn "$previous" "$APP_ROOT/current.rollback"
    mv -Tf "$APP_ROOT/current.rollback" "$APP_ROOT/current"
    restart_stack || true
  else
    echo "No distinct previous release is available; stopping only this application's services." >&2
    systemctl stop devfluency.target devfluency-frontend.service || true
  fi
  exit 1
}

ln -sfn "$release" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"

systemctl daemon-reload
if ! restart_stack; then
  rollback
fi

for service in auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service bff; do
  systemctl is-active --quiet "devfluency@${service}.service" || rollback
done
systemctl is-active --quiet devfluency-frontend.service || rollback

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
    echo "Platform deployment $sha healthy."
    exit 0
  fi
  sleep 1
done
rollback
