#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
WORKSPACE_DIR=$(cd -- "$REPO_DIR/.." && pwd)

VERSION=${1:-}
if [ -z "$VERSION" ]; then
  echo "usage: $0 <version>" >&2
  exit 1
fi

RELEASE_ROOT="$REPO_DIR/target/release-bundle"
ARTIFACT_DIR="$RELEASE_ROOT/zed-web-${VERSION}-linux-x86_64"

rm -rf "$ARTIFACT_DIR"
mkdir -p "$ARTIFACT_DIR/bin" "$ARTIFACT_DIR/frontend" "$ARTIFACT_DIR/deploy" "$ARTIFACT_DIR/scripts"

cargo build --release -p gateway-server --manifest-path "$REPO_DIR/Cargo.toml"

pushd "$WORKSPACE_DIR/zed-web-frontend" >/dev/null
bun install --frozen-lockfile
bun run build
popd >/dev/null

cp "$REPO_DIR/target/release/gateway-server" "$ARTIFACT_DIR/bin/gateway-server"
cp -R "$WORKSPACE_DIR/zed-web-frontend/dist/." "$ARTIFACT_DIR/frontend/"
cp "$WORKSPACE_DIR/Dockerfile" "$ARTIFACT_DIR/"
cp "$WORKSPACE_DIR/docker-compose.yml" "$ARTIFACT_DIR/"
cp "$WORKSPACE_DIR/.env.example" "$ARTIFACT_DIR/"
cp "$WORKSPACE_DIR/README.md" "$ARTIFACT_DIR/"
cp "$WORKSPACE_DIR/DEPLOY.md" "$ARTIFACT_DIR/"
cp -R "$WORKSPACE_DIR/deploy/." "$ARTIFACT_DIR/deploy/"
cp -R "$WORKSPACE_DIR/scripts/." "$ARTIFACT_DIR/scripts/"

chmod +x "$ARTIFACT_DIR/bin/gateway-server"
find "$ARTIFACT_DIR/scripts" -type f -name '*.sh' -exec chmod +x {} +
find "$ARTIFACT_DIR/deploy" -type f -name '*.sh' -exec chmod +x {} +

tar -C "$RELEASE_ROOT" -czf "$REPO_DIR/target/zed-web-${VERSION}-linux-x86_64.tar.gz" "zed-web-${VERSION}-linux-x86_64"

echo "$REPO_DIR/target/zed-web-${VERSION}-linux-x86_64.tar.gz"
