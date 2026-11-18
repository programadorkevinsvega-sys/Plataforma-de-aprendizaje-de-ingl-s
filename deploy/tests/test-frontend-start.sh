#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
START_SCRIPT="$SCRIPT_DIR/start-frontend.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

cat > "$tmp/fake-node" <<'NODE'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$PWD" > "$NODE_MARKER"
printf '%s\n' "$@" >> "$NODE_MARKER"
NODE
chmod 0755 "$tmp/fake-node"

# Legacy package layout: server.js directly under frontend/.
mkdir -p "$tmp/legacy"
touch "$tmp/legacy/server.js"
NODE_MARKER="$tmp/legacy-marker" \
NODE_BINARY="$tmp/fake-node" \
DEVFLUENCY_FRONTEND_ROOT="$tmp/legacy" \
  bash "$START_SCRIPT" || fail "legacy frontend layout did not start"
[[ "$(sed -n '1p' "$tmp/legacy-marker")" == "$tmp/legacy" ]] || fail "legacy layout selected the wrong working directory"
[[ "$(sed -n '2p' "$tmp/legacy-marker")" == "server.js" ]] || fail "legacy layout did not execute server.js"

# Current pnpm/Next standalone layout: server.js under frontend/frontend/.
mkdir -p "$tmp/workspace/frontend"
touch "$tmp/workspace/frontend/server.js"
NODE_MARKER="$tmp/workspace-marker" \
NODE_BINARY="$tmp/fake-node" \
DEVFLUENCY_FRONTEND_ROOT="$tmp/workspace" \
  bash "$START_SCRIPT" || fail "workspace frontend layout did not start"
[[ "$(sed -n '1p' "$tmp/workspace-marker")" == "$tmp/workspace/frontend" ]] || fail "workspace layout selected the wrong working directory"
[[ "$(sed -n '2p' "$tmp/workspace-marker")" == "server.js" ]] || fail "workspace layout did not execute server.js"

# Missing server must fail loudly rather than start in an invalid directory.
mkdir -p "$tmp/missing"
if NODE_BINARY="$tmp/fake-node" DEVFLUENCY_FRONTEND_ROOT="$tmp/missing" "$START_SCRIPT" >/dev/null 2>&1; then
  fail "accepted a package without server.js"
fi

echo "Frontend start layout tests passed."
