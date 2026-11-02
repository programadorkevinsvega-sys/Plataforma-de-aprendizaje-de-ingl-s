#!/usr/bin/env bash
# Move the Cloudflare API token out of the environment file shared by Rust
# services and into a file loaded only by phonetic-audio-service.
set -Eeuo pipefail

migrate_cloudflare_api_token() {
  local shared_env="$1"
  local audio_secrets="$2"
  local token_line

  [[ -f "$shared_env" ]] || {
    echo "Shared application environment file not found: $shared_env" >&2
    return 1
  }
  [[ -f "$audio_secrets" ]] || {
    echo "Audio service secret file not found: $audio_secrets" >&2
    return 1
  }

  token_line="$(grep '^CLOUDFLARE_API_TOKEN=' "$shared_env" | tail -n 1 || true)"
  if [[ -n "$token_line" ]]; then
    # The shared file is the migration source of truth when it still contains
    # the variable, so an operator's newly supplied token replaces the old one.
    sed -i '/^CLOUDFLARE_API_TOKEN=/d' "$audio_secrets"
    printf '%s\n' "$token_line" >> "$audio_secrets"
    sed -i '/^CLOUDFLARE_API_TOKEN=/d' "$shared_env"
  fi

  chmod 0600 "$audio_secrets"
}
