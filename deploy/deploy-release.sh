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
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/health-checks.sh
source "$SCRIPT_DIR/lib/health-checks.sh"

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
test -x "$stage/bin/sqlx"
test -f "$stage/frontend/server.js"
test -d "$stage/migrations"
migration_count="$(find "$stage/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l)"
[[ "$migration_count" -gt 0 ]] || { echo "No SQL migrations found in release package." >&2; exit 1; }
chown -R root:devfluency "$stage"
find "$stage" -type d -exec chmod 0750 {} +
find "$stage/bin" -type f -exec chmod 0750 {} +
find "$stage/frontend" -type f -exec chmod 0640 {} +
find "$stage/migrations" -type f -exec chmod 0640 {} +
chmod 0750 "$stage/frontend/server.js"

if [[ -e "$release" ]]; then
  echo "Release $sha already exists; reusing immutable release."
  rm -rf -- "$stage"
  stage=""
else
  mv "$stage" "$release"
  stage=""
fi

# Run versioned SQLx migrations against the application's database before
# switching the active release or restarting any service. The database name
# guard prevents an accidental migration of the default "postgres" database.
database_url="$(sed -n 's/^DATABASE_URL=//p' "$APP_CONFIG" | tail -n 1)"
database_url="${database_url#\"}"
database_url="${database_url%\"}"
database_url="${database_url#\'}"
database_url="${database_url%\'}"
database_without_query="${database_url%%\?*}"
database_name="${database_without_query##*/}"
if [[ "$database_name" != "aprendizaje_ingles" ]]; then
  echo "DATABASE_URL must target database aprendizaje_ingles; refusing to run migrations." >&2
  exit 1
fi
echo "Applying $migration_count SQL migration files to aprendizaje_ingles."
if ! DATABASE_URL="$database_url" "$release/bin/sqlx" migrate run --source "$release/migrations"; then
  echo "Database migrations failed. The active application release was not changed and services were not restarted." >&2
  exit 1
fi
echo "Database migrations completed successfully."

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

# Derive the HTTP probe host and BFF port from the same address used by the
# running service. The frontend is exposed on this VM interface as well.
if ! load_bff_http_probe_target "$APP_CONFIG"; then
  echo "Cannot determine HTTP health-check target from BFF_HTTP_BIND_ADDR." >&2
  rollback
fi
echo "Checking BFF and frontend on ${BFF_HTTP_PROBE_HOST} (BFF port ${BFF_HTTP_PROBE_PORT}, frontend port 3000)."

# Rust gRPC services bind to loopback; keep those checks local.
for port in 50051 50052 50053 50054 50055 50056; do
  ready=0
  for _ in $(seq 1 30); do
    if timeout 1 bash -c ":</dev/tcp/127.0.0.1/$port" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" -eq 1 ]] || { echo "Timed out waiting for gRPC port $port." >&2; rollback; }
done

for port in "$BFF_HTTP_PROBE_PORT" 3000; do
  ready=0
  for _ in $(seq 1 30); do
    if timeout 1 bash -c ":</dev/tcp/$BFF_HTTP_PROBE_HOST/$port" 2>/dev/null; then ready=1; break; fi
    sleep 1
  done
  [[ "$ready" -eq 1 ]] || { echo "Timed out waiting for HTTP port $port on $BFF_HTTP_PROBE_HOST." >&2; rollback; }
done

http_healthy=0
for _ in $(seq 1 30); do
  if curl --connect-timeout 2 -fsS "http://$BFF_HTTP_PROBE_HOST:$BFF_HTTP_PROBE_PORT/health" >/dev/null &&
     curl --connect-timeout 2 -fsS "http://$BFF_HTTP_PROBE_HOST:3000/" >/dev/null; then
    echo "Platform deployment $sha passed HTTP health checks."
    http_healthy=1
    break
  fi
  sleep 1
done
if [[ "$http_healthy" -ne 1 ]]; then
  echo "HTTP health checks failed for BFF or frontend on $BFF_HTTP_PROBE_HOST." >&2
  rollback
fi

# Verify one real provider synthesis after the release is active. This catches
# invalid credentials/upstream failures that process and HTTP health checks miss.
tts_smoke_setting="$(sed -n 's/^DEPLOY_TTS_SMOKE_TEST=//p' "$APP_CONFIG" | tail -n 1)"
case "${tts_smoke_setting,,}" in
  false|0|no)
    echo "TTS functional smoke test disabled by DEPLOY_TTS_SMOKE_TEST."
    ;;
  *)
    echo "Running one functional TTS synthesis against the configured provider."
    systemctl reset-failed devfluency-tts-smoke.service || true
    if ! systemctl start devfluency-tts-smoke.service; then
      echo "TTS functional smoke test failed for release $sha." >&2
      rollback
    fi
    echo "TTS functional smoke test passed."
    ;;
esac

echo "Platform deployment $sha passed all functional checks."
exit 0
