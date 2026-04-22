# Zed Web Docker Deployment

## Recommended Deployment

Use the published GHCR image unless you need to build the project from source. This is the simplest and recommended way to deploy Zed Web.

## Required Files

Keep these files together:

- `docker-compose.yml`
- `.env.example`

Initialize your local configuration:

```bash
cp .env.example .env
mkdir -p data
```

## Port Model

This setup uses two different kinds of ports:

- `HOST_PORT`: the public port exposed on the Docker host, for example `8888`
- `GATEWAY_PORT`: the internal port used by the gateway process inside the container

Use them differently:

- Change `HOST_PORT` when you want the app to listen on a different host port.
- Do not change `GATEWAY_PORT` just to move the public entrypoint.
- Leave `GATEWAY_PORT` at `8080` unless you are intentionally changing the container internals.

## Example `.env`

This is a working example for the published image:

```dotenv
ZED_WEB_IMAGE=ghcr.io/un4gt/zed-web:latest
HOST_PORT=8888
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=8080
FRONTEND_PORT=8081
ZED_WEB_DATA_PATH=./data
ZED_WEB_SSH_PATH=${HOME}/.ssh
```

Notes:

- `ZED_WEB_IMAGE` lets you choose the image without editing `docker-compose.yml`.
- `FRONTEND_PORT` can stay at its default value in Docker deployments. The published image serves the built frontend through the web entrypoint and does not need a separate frontend preview port.

## Example `docker-compose.yml`

The repository compose file supports both source builds and published images:

```yaml
services:
  zed-web:
    image: ${ZED_WEB_IMAGE:-ghcr.io/un4gt/zed-web:latest}
    container_name: zed-web
    restart: unless-stopped
    ports:
      - "${HOST_PORT:-8080}:80"
    environment:
      GATEWAY_HOST: ${GATEWAY_HOST:-0.0.0.0}
      GATEWAY_PORT: ${GATEWAY_PORT:-8080}
      FRONTEND_PORT: ${FRONTEND_PORT:-8081}
      ZED_WEB_DATA_DIR: /var/lib/zed-web
      SSH_AUTH_SOCK: /ssh-agent
    volumes:
      - ${ZED_WEB_DATA_PATH:-./data}:/var/lib/zed-web
      - ${ZED_WEB_SSH_PATH:-${HOME}/.ssh}:/root/.ssh:ro
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

## Start the Service

For the published image:

```bash
docker compose pull
docker compose up -d
```

Then open:

```text
http://<server-ip>:<HOST_PORT>
```

Example:

```text
http://127.0.0.1:8888
```

## Common Port Mistake

A common mistake is changing `GATEWAY_PORT` to match the public port, for example:

```dotenv
GATEWAY_PORT=8888
```

This is usually wrong.

Why it breaks:

- `ports: "${HOST_PORT}:80"` already exposes the app on your chosen public port.
- `GATEWAY_PORT` changes where the backend listens inside the container.
- the web entrypoint proxies `/api/*` to the internal gateway.
- if the internal gateway port changes without updating the rest of the container wiring, the UI may load while backend requests fail.

If you want the app to be reachable at `http://host:8888`, set:

```dotenv
HOST_PORT=8888
GATEWAY_PORT=8080
```

## Troubleshooting

If the home page loads but creating or opening a session fails:

1. Run `docker compose logs -f`.
2. Make sure `GATEWAY_PORT=8080` unless you intentionally changed the image internals.
3. Make sure you are opening `http://<server-ip>:<HOST_PORT>`.
4. Confirm that `ZED_WEB_SSH_PATH` exists on the host and contains the expected SSH keys.

If the selected host port is already in use:

1. Pick another `HOST_PORT`, such as `8899`.
2. Restart the service with `docker compose up -d`.

## Source Build Instead of GHCR

If you prefer to build from a local checkout instead of using `ghcr.io/un4gt/zed-web:latest`, run:

```bash
docker compose build
docker compose up -d
```
