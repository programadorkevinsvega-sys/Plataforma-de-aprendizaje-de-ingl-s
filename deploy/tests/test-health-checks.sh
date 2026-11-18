#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/lib/health-checks.sh
source "$SCRIPT_DIR/lib/health-checks.sh"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

printf '%s\n' 'BFF_HTTP_BIND_ADDR=10.0.2.70:8080' > "$tmp"
load_bff_http_probe_target "$tmp" || fail "could not parse private IPv4 bind address"
[[ "$BFF_HTTP_PROBE_HOST" == "10.0.2.70" ]] || fail "unexpected host: $BFF_HTTP_PROBE_HOST"
[[ "$BFF_HTTP_PROBE_PORT" == "8080" ]] || fail "unexpected port: $BFF_HTTP_PROBE_PORT"

printf '%s\n' 'BFF_HTTP_BIND_ADDR="127.0.0.1:8080"' > "$tmp"
load_bff_http_probe_target "$tmp" || fail "could not parse quoted bind address"
[[ "$BFF_HTTP_PROBE_HOST" == "127.0.0.1" && "$BFF_HTTP_PROBE_PORT" == "8080" ]] || fail "quoted address parsed incorrectly"

printf '%s\n' 'BFF_HTTP_BIND_ADDR=0.0.0.0:8080' > "$tmp"
load_bff_http_probe_target "$tmp" || fail "could not parse wildcard bind address"
[[ "$BFF_HTTP_PROBE_HOST" == "127.0.0.1" ]] || fail "wildcard bind must be probed through loopback"

printf '%s\n' 'BFF_HTTP_BIND_ADDR=10.0.2.70' > "$tmp"
if load_bff_http_probe_target "$tmp" >/dev/null 2>&1; then
  fail "accepted bind address without a port"
fi

printf '%s\n' 'BFF_HTTP_BIND_ADDR=10.0.2.70:99999' > "$tmp"
if load_bff_http_probe_target "$tmp" >/dev/null 2>&1; then
  fail "accepted out-of-range port"
fi

echo "Deployment health-check helper tests passed."
