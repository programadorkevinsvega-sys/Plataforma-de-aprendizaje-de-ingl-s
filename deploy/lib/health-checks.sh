#!/usr/bin/env bash
# Helpers for deriving local HTTP health-check targets from the production env.
# This file is safe to source from deployment scripts and tests.

load_bff_http_probe_target() {
  local config_file="$1"
  local configured_addr

  [[ -r "$config_file" ]] || {
    echo "Cannot read application config: $config_file" >&2
    return 1
  }

  configured_addr="$(sed -n 's/^BFF_HTTP_BIND_ADDR=//p' "$config_file" | head -n 1)"
  configured_addr="${configured_addr%$'\r'}"
  configured_addr="${configured_addr#\"}"
  configured_addr="${configured_addr%\"}"
  configured_addr="${configured_addr#\'}"
  configured_addr="${configured_addr%\'}"

  # The deployment config currently uses IPv4/hostname:port notation.
  if [[ "$configured_addr" != *:* ]]; then
    echo "BFF_HTTP_BIND_ADDR must use host:port notation." >&2
    return 1
  fi

  BFF_HTTP_PROBE_HOST="${configured_addr%:*}"
  BFF_HTTP_PROBE_PORT="${configured_addr##*:}"

  if [[ -z "$BFF_HTTP_PROBE_HOST" || ! "$BFF_HTTP_PROBE_PORT" =~ ^[0-9]{1,5}$ ]] ||
     (( BFF_HTTP_PROBE_PORT < 1 || BFF_HTTP_PROBE_PORT > 65535 )); then
    echo "BFF_HTTP_BIND_ADDR contains an invalid host or port." >&2
    return 1
  fi

  # A wildcard bind is reachable through loopback on the same machine.
  case "$BFF_HTTP_PROBE_HOST" in
    0.0.0.0|'*') BFF_HTTP_PROBE_HOST="127.0.0.1" ;;
  esac
}
