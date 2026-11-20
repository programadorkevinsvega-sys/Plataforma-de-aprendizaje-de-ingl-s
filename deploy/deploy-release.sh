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
AUDIO_CONFIG="/etc/apps/plataforma-aprendizaje/phonetic-audio-service.env"
RELEASES_ROOT="$APP_ROOT/releases"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/lib/health-checks.sh
source "$SCRIPT_DIR/lib/health-checks.sh"
# shellcheck source=deploy/lib/frontend-layout.sh
source "$SCRIPT_DIR/lib/frontend-layout.sh"

[[ -s "$APP_CONFIG" ]] || { echo "Missing $APP_CONFIG" >&2; exit 1; }
[[ -s "$AUDIO_CONFIG" ]] || { echo "Missing $AUDIO_CONFIG" >&2; exit 1; }
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
  if [[ -n "${audio_generation_stage:-}" && -d "$audio_generation_stage" ]]; then rm -rf -- "$audio_generation_stage"; fi
  if [[ -n "${merged_catalog:-}" && -f "$merged_catalog" ]]; then rm -f -- "$merged_catalog"; fi
}
audio_generation_stage=""
merged_catalog=""
trap cleanup_stage EXIT
tar -xzf "$archive" -C "$stage"
for binary in bff auth-identity-service content-vocabulary-service ai-evaluator-service phonetic-audio-service srs-engine-service gamification-progress-service; do
  test -x "$stage/bin/$binary"
done
test -x "$stage/bin/sqlx"
test -x "$stage/bin/tts-smoke-test"
test -x "$stage/bin/generate-listening-assets"
test -s "$stage/tools/curriculum/deploy_initial_release.mjs"
test -e "$stage/node_modules/pg"
test -s "$stage/crates/content-vocabulary-service/data/lexical_catalog.v2.json"
test -s "$stage/tools/curriculum/initial-release-comprehension.v1.json"
test -s "$stage/tests/fixtures/curriculum/initial-release-english-general-pre-a1-v1.json"
test -s "$stage/tests/fixtures/curriculum/initial-release-english-general-a1-v1.json"
frontend_server="$(frontend_server_path "$stage/frontend")" || {
  echo "Frontend standalone server.js is missing from both supported package layouts." >&2
  exit 1
}
test -d "$stage/migrations"
migration_count="$(find "$stage/migrations" -maxdepth 1 -type f -name '*.sql' | wc -l)"
[[ "$migration_count" -gt 0 ]] || { echo "No SQL migrations found in release package." >&2; exit 1; }
chown -R root:devfluency "$stage"
find "$stage" -type d -exec chmod 0750 {} +
find "$stage/bin" -type f -exec chmod 0750 {} +
find "$stage/frontend" -type f -exec chmod 0640 {} +
find "$stage/migrations" -type f -exec chmod 0640 {} +
test -r "$frontend_server"

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

# Load the approved initial curriculum as part of the same release, not as a
# separate manual VM operation. The catalogue hash keys immutable audio assets.
echo "Preparing the initial English General Pre-A1/A1 curriculum release."
merged_catalog="/tmp/devfluency-initial-catalog-${sha}.json"
CURRICULUM_RELEASE_ROOT="$release" node "$release/tools/curriculum/deploy_initial_release.mjs" --prepare-catalog "$merged_catalog"
catalog_sha256="$(sha256sum "$merged_catalog" | awk '{print $1}')"

audio_state_root="/var/lib/devfluency/listening-audio"
audio_release="$audio_state_root/releases/$catalog_sha256"
install -d -o root -g devfluency -m 0750 "$audio_state_root/releases"
audio_release_valid=false
if [[ -s "$audio_release/listening-audio-manifest.v1.json" ]]; then
  if AUDIO_ASSET_DIR="$audio_release" CURRICULUM_RELEASE_ROOT="$release" \
    node "$release/tools/curriculum/deploy_initial_release.mjs" --verify-audio; then
    audio_release_valid=true
  else
    echo "Existing Listening audio release is incomplete or mismatched; regenerating it."
  fi
fi

if [[ "$audio_release_valid" != "true" ]]; then
  # A previous interrupted copy is not a valid release; discard only this
  # hash-scoped incomplete directory and synthesize it again.
  if [[ -e "$audio_release" ]]; then
    rm -rf -- "$audio_release"
  fi
  audio_generation_stage="$(mktemp -d /tmp/devfluency-audio-generation.XXXXXX)"
  audio_output="$audio_generation_stage/assets"
  tts_provider="$(sed -n 's/^TTS_PROVIDER=//p' "$AUDIO_CONFIG" | tail -n 1)"
  tts_provider="${tts_provider#\"}"
  tts_provider="${tts_provider%\"}"
  tts_provider="${tts_provider:-aws}"
  tts_smoke_endpoint="$(sed -n 's/^PHONETIC_SERVICE_GRPC_URL=//p' "$APP_CONFIG" | tail -n 1)"
  tts_smoke_endpoint="${tts_smoke_endpoint#\"}"
  tts_smoke_endpoint="${tts_smoke_endpoint%\"}"
  tts_smoke_endpoint="${tts_smoke_endpoint:-http://127.0.0.1:50054}"
  echo "Generating all Listening assets with provider '$tts_provider'."
  TTS_PROVIDER="$tts_provider" TTS_SMOKE_ENDPOINT="$tts_smoke_endpoint" \
    "$release/bin/generate-listening-assets" --catalog "$merged_catalog" --apply --output-dir "$audio_output"
  install -d -o root -g devfluency -m 0750 "$audio_release"
  cp -a "$audio_output/." "$audio_release/"
  chown -R root:devfluency "$audio_release"
  find "$audio_release" -type d -exec chmod 0750 {} +
  find "$audio_release" -type f -exec chmod 0640 {} +
else
  echo "Reusing Listening audio assets for catalogue hash $catalog_sha256."
fi

# Expose the persistent audio release through Next.js public assets. The media
# files survive future immutable application releases and remain available at
# the same relative URL stored in PostgreSQL.
ln -sfn "$audio_release" "$audio_state_root/current.next"
mv -Tf "$audio_state_root/current.next" "$audio_state_root/current"
active_frontend_server="$(frontend_server_path "$release/frontend")"
frontend_app_root="$(dirname "$active_frontend_server")"
frontend_public="$frontend_app_root/public"
install -d -o root -g devfluency -m 0750 "$frontend_public/audio"
if [[ -e "$frontend_public/audio/listening" && ! -L "$frontend_public/audio/listening" ]]; then
  echo "Refusing to replace a non-symlink Listening asset directory in the release." >&2
  exit 1
fi
ln -sfn "$audio_state_root/current" "$frontend_public/audio/listening.next"
mv -Tf "$frontend_public/audio/listening.next" "$frontend_public/audio/listening"
chown -h root:devfluency "$frontend_public/audio/listening"

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

for _ in $(seq 1 30); do
  if curl --connect-timeout 2 -fsS "http://$BFF_HTTP_PROBE_HOST:$BFF_HTTP_PROBE_PORT/health" >/dev/null &&
     curl --connect-timeout 2 -fsS "http://$BFF_HTTP_PROBE_HOST:3000/" >/dev/null; then
    break
  fi
  sleep 1
done

if ! curl --connect-timeout 2 -fsS "http://$BFF_HTTP_PROBE_HOST:$BFF_HTTP_PROBE_PORT/health" >/dev/null ||
   ! curl --connect-timeout 2 -fsS "http://$BFF_HTTP_PROBE_HOST:3000/" >/dev/null; then
  echo "HTTP health checks failed for BFF or frontend on $BFF_HTTP_PROBE_HOST." >&2
  rollback
fi

while IFS= read -r audio_file; do
  [[ "$audio_file" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]*\.mp3$ ]] || rollback
  curl --connect-timeout 3 -fsS "http://$BFF_HTTP_PROBE_HOST:3000/audio/listening/$audio_file" -o /dev/null || {
    echo "Listening asset is not publicly served by the frontend: $audio_file." >&2
    rollback
  }
done < <(node -e 'const m=require(process.argv[1]); for (const a of m.assets) console.log(a.asset_file)' "$audio_release/listening-audio-manifest.v1.json")

tts_provider="$(sed -n 's/^TTS_PROVIDER=//p' "$AUDIO_CONFIG" | tail -n 1)"
tts_provider="${tts_provider#\"}"
tts_provider="${tts_provider%\"}"
tts_provider="${tts_provider#\'}"
tts_provider="${tts_provider%\'}"
tts_provider="${tts_provider:-aws}"
tts_smoke_endpoint="$(sed -n 's/^PHONETIC_SERVICE_GRPC_URL=//p' "$APP_CONFIG" | tail -n 1)"
tts_smoke_endpoint="${tts_smoke_endpoint#\"}"
tts_smoke_endpoint="${tts_smoke_endpoint%\"}"
tts_smoke_endpoint="${tts_smoke_endpoint#\'}"
tts_smoke_endpoint="${tts_smoke_endpoint%\'}"
tts_smoke_endpoint="${tts_smoke_endpoint:-http://127.0.0.1:50054}"
echo "Running one real TTS synthesis smoke test against provider '$tts_provider' via $tts_smoke_endpoint."
if ! TTS_PROVIDER="$tts_provider" TTS_SMOKE_ENDPOINT="$tts_smoke_endpoint" "$release/bin/tts-smoke-test"; then
  echo "Functional TTS smoke test failed for provider '$tts_provider'." >&2
  rollback
fi

# Publish only after the new frontend is live and every generated audio URL is
# reachable through its public route. The editorial transaction stays atomic.
curriculum_editor_id="$(sed -n 's/^CURRICULUM_EDITOR_USER_ID=//p' "$APP_CONFIG" | tail -n 1)"
curriculum_editor_id="${curriculum_editor_id#\"}"
curriculum_editor_id="${curriculum_editor_id%\"}"
if ! DATABASE_URL="$database_url" AUDIO_ASSET_DIR="$audio_release" \
  CURRICULUM_RELEASE_ROOT="$release" CURRICULUM_EDITOR_USER_ID="$curriculum_editor_id" \
  node "$release/tools/curriculum/deploy_initial_release.mjs" --publish; then
  echo "Initial curriculum import/publication failed; rolling back the application release." >&2
  rollback
fi
echo "Initial curriculum import, editorial publication and database verification succeeded."
echo "Platform deployment $sha passed HTTP, TTS and curriculum publication checks."
