---
title: Docker Deployment
description: Deploy zed-web as a single container using the published image or a local source build.
sidebar_position: 4
---

Docker Compose is the recommended deployment path. The image contains:

- `gateway-server`
- built React frontend assets
- `openssh-client`
- Caddy

Caddy listens on container port `80` and proxies HTTP, static assets, API routes, and WebSocket requests to the internal gateway.

## Prepare Configuration

```bash
cp .env.example .env
mkdir -p data
```

Edit `.env` and set at least:

```dotenv
ZEW_USERNAME=admin
ZEW_PASSWORD=change-this-password
```

Docker deployment requires both values to be present and non-empty. They protect the page, static assets, API routes, and WebSocket handshakes.

## Start From The Published Image

```bash
docker compose pull
docker compose up -d
```

Default URL:

```text
http://127.0.0.1:4173
```

To change the public host port, change only `HOST_PORT`:

```dotenv
HOST_PORT=8888
```

## Build From Source

```bash
docker compose build zed-web
docker compose up -d zed-web
```

Use a clean rebuild after dependency or Dockerfile changes:

```bash
docker compose build --no-cache zed-web
docker compose up -d zed-web
```

## Key Environment Variables

| Variable | Purpose |
| --- | --- |
| `ZED_WEB_IMAGE` | Compose image, default `ghcr.io/un4gt/zed-web:latest`. |
| `HOST_PORT` | Public HTTP port on the host, default `4173`. |
| `GATEWAY_HOST` | Gateway bind address inside the container, default `127.0.0.1`. |
| `GATEWAY_PORT` | Gateway port inside the container, default `8080`. |
| `ZEW_USERNAME` | HTTP Basic Auth username. |
| `ZEW_PASSWORD` | HTTP Basic Auth password. |
| `ZED_WEB_DATA_PATH` | Host runtime/cache directory, default `./data`. |
| `ZED_WEB_SSH_PATH` | Host SSH config and key directory, default `${HOME}/.ssh`. |

The container runtime data directory is always `/var/lib/zed-web`.

## SSH Access

The container only needs outbound SSH. It does not run an SSH server. Compose mounts the SSH directory read-only by default:

```yaml
- ${ZED_WEB_SSH_PATH:-${HOME}/.ssh}:/root/.ssh:ro
```

If an SSH agent is available, Compose mounts `SSH_AUTH_SOCK` at `/ssh-agent`.

To connect from the container to the Docker host, use this SSH host:

```text
host.docker.internal
```

To connect to another machine, use that machine's DNS name or IP address.

## Validate

```bash
curl -fsS -u "$ZEW_USERNAME:$ZEW_PASSWORD" \
  http://127.0.0.1:${HOST_PORT:-4173}/api/health
```

Expected response:

```json
{"ok":true}
```

Then open the browser UI, enter SSH host, user, port, and project path, open a project, edit a file, and save it.
