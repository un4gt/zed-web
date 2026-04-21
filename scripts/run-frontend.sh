#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)

cd "$ROOT_DIR/zed-web-frontend"
exec bun run preview --host 127.0.0.1 --port "${FRONTEND_PORT:-8081}"
