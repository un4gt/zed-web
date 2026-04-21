#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${ZED_WEB_DATA_DIR:-/var/lib/zed-web}"

if [ -S /ssh-agent ]; then
  export SSH_AUTH_SOCK=/ssh-agent
fi

/opt/zed-web/bin/gateway-server &
gateway_pid=$!

cleanup() {
  kill "$gateway_pid" >/dev/null 2>&1 || true
}

trap cleanup EXIT INT TERM

exec /usr/bin/caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
