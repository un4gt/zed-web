#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

export GATEWAY_HOST="${GATEWAY_HOST:-127.0.0.1}"
export GATEWAY_PORT="${GATEWAY_PORT:-8080}"
export ZED_WEB_DATA_DIR="${ZED_WEB_DATA_DIR:-$ROOT_DIR/.local/share/zed-web}"

mkdir -p "$ZED_WEB_DATA_DIR"

cd "$ROOT_DIR/zed-web-gateway"
exec cargo run --release -p gateway-server
