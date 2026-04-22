#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
GATEWAY_DIR="$ROOT_DIR/zed-web-gateway"
FRONTEND_DIR="$ROOT_DIR/zed-web-frontend"

VERSION=${1:-}
if [ -z "$VERSION" ]; then
  echo "usage: $0 <version>" >&2
  exit 1
fi

RELEASE_ROOT="$ROOT_DIR/target/release-bundle"
ARTIFACT_DIR="$RELEASE_ROOT/zed-web-${VERSION}-linux-x86_64"

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/bin" "$ARTIFACT_DIR/frontend" "$ARTIFACT_DIR/deploy" "$ARTIFACT_DIR/scripts"

cargo build --release -p gateway-server --manifest-path "$GATEWAY_DIR/Cargo.toml"

pushd "$FRONTEND_DIR" >/dev/null
bun install --frozen-lockfile
bun run build
popd >/dev/null

cp "$GATEWAY_DIR/target/release/gateway-server" "$ARTIFACT_DIR/bin/gateway-server"
cp -R "$FRONTEND_DIR/dist/." "$ARTIFACT_DIR/frontend/"
cp "$ROOT_DIR/Dockerfile" "$ARTIFACT_DIR/"
cp "$ROOT_DIR/docker-compose.yml" "$ARTIFACT_DIR/"
cp "$ROOT_DIR/.env.example" "$ARTIFACT_DIR/"
cp "$ROOT_DIR/README.md" "$ARTIFACT_DIR/"
cp "$ROOT_DIR/DEPLOY.md" "$ARTIFACT_DIR/"
cp -R "$ROOT_DIR/deploy/." "$ARTIFACT_DIR/deploy/"
cp -R "$ROOT_DIR/scripts/." "$ARTIFACT_DIR/scripts/"

chmod +x "$ARTIFACT_DIR/bin/gateway-server"
find "$ARTIFACT_DIR/scripts" -type f -name '*.sh' -exec chmod +x {} +
find "$ARTIFACT_DIR/deploy" -type f -name '*.sh' -exec chmod +x {} +

mkdir -p "$ROOT_DIR/target"
tar -C "$RELEASE_ROOT" -czf "$ROOT_DIR/target/zed-web-${VERSION}-linux-x86_64.tar.gz" "zed-web-${VERSION}-linux-x86_64"

echo "$ROOT_DIR/target/zed-web-${VERSION}-linux-x86_64.tar.gz"
