#!/usr/bin/env bash
# Resolve the Next.js standalone server location without changing package layout.
frontend_server_path() {
  local frontend_root="${1:?frontend root is required}"

  if [[ -f "$frontend_root/server.js" ]]; then
    printf '%s\n' "$frontend_root/server.js"
  elif [[ -f "$frontend_root/frontend/server.js" ]]; then
    printf '%s\n' "$frontend_root/frontend/server.js"
  else
    return 1
  fi
}
