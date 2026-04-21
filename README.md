# Zed Web Deployment

## Docker

The recommended deployment path is a single Docker image that contains:

- `gateway-server`
- the built frontend static assets
- `openssh-client`
- `caddy` as the thin web entrypoint

The container uses outbound SSH directly. It does not require an SSH server on the host.

### Start with Docker Compose

```bash
cp .env.example .env
mkdir -p data
docker compose build
docker compose up -d
```

Then open:

```text
http://localhost:8080
```

### SSH credentials inside Docker

The default compose file mounts your host SSH directory into the container:

- `${ZED_WEB_SSH_PATH}:/root/.ssh:ro`

### Docker data directory

The Docker Compose setup now stores managed remote-server cache and other runtime data in a host-visible directory:

- `${ZED_WEB_DATA_PATH}:/var/lib/zed-web`

By default this is:

- `./data`

This keeps the MVP deployment simple and makes cache inspection and cleanup obvious from the host filesystem.

## Bare Install

### Prerequisites

- Bun
- Rust toolchain
- `openssh-client`

### Start gateway only

```bash
./scripts/run-gateway.sh
```

### Start frontend preview only

```bash
./scripts/run-frontend.sh
```

### Start both locally

```bash
./scripts/run-local.sh
```

By default:

- gateway listens on `127.0.0.1:8080`
- frontend preview listens on `127.0.0.1:8081`

## Environment

Common environment variables:

- `GATEWAY_HOST`
- `GATEWAY_PORT`
- `FRONTEND_PORT`
- `ZED_WEB_DATA_DIR`

## Remote Server Version Policy

The session form supports three remote-server modes:

- `latest`: default behavior, resolves the newest Zed GitHub release tag at session open time
- `pinned`: use a user-provided version such as `v0.232.3`
- `disabled`: skip managed version selection and use the configured remote binary path directly

The UI exposes this policy during project open so users can:

- stay on the default latest policy
- pin a specific Zed release
- disable managed updates entirely

When managed mode is enabled (`latest` or `pinned`), Gateway now:

- resolves the requested Zed release version
- downloads and caches the managed remote-server asset under `ZED_WEB_DATA_DIR`
- uploads it to a controlled directory on the remote host
- starts the remote proxy from that managed path

## Release Automation

Tag pushes matching `v.*` trigger `.github/workflows/release.yml`.

That workflow publishes:

- a Docker image to `ghcr.io/<owner>/<repo>`
- a bare-install tarball attached to the GitHub release

The bare-install tarball is produced by:

```bash
./scripts/package-release.sh v0.0.0
```
