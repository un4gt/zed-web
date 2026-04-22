# Zed Web Docker Deployment

## Recommended Path

Use the published container image and keep the container-internal defaults unless you are changing the image itself.

## Files To Download

- `docker-compose.yml`
- `.env.example`

Create your local env file:

```bash
cp .env.example .env
mkdir -p data
```

## Correct Port Model

There are two different kinds of ports in this setup:

- `HOST_PORT`: the port exposed on the Docker host, for example `8888`
- `GATEWAY_PORT`: the internal port used by the gateway process inside the container

If port `80` or `8080` is already occupied on the host, change `HOST_PORT`. Do not change `GATEWAY_PORT` just to move the public entrypoint.

Example `.env`:

```dotenv
ZED_WEB_IMAGE=ghcr.io/un4gt/zed-web:latest
HOST_PORT=8888
GATEWAY_HOST=0.0.0.0
GATEWAY_PORT=8080
FRONTEND_PORT=8081
ZED_WEB_DATA_PATH=./data
ZED_WEB_SSH_PATH=${HOME}/.ssh
```

## Compose Example

The published-image compose file should look like this:

```yaml
services:
  zed-web:
    image: ghcr.io/un4gt/zed-web:latest
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

## Start The Service

```bash
docker compose pull
docker compose up -d
```

With the repository compose file, you can avoid editing YAML by setting `ZED_WEB_IMAGE` in `.env`.

Open:

```text
http://<server-ip>:<HOST_PORT>
```

Example:

```text
http://127.0.0.1:8888
```

## What Went Wrong In Your Attempt

Your public port change was correct in `ports`, but this line was the problem:

```dotenv
GATEWAY_PORT=8888
```

Why it breaks:

- `8888:80` already makes the app reachable from the host on port `8888`
- `GATEWAY_PORT` changes the backend listener inside the container
- the web entrypoint proxies `/api/*` to the gateway inside the container
- changing the internal port without matching proxy behavior causes the UI to load while backend requests fail

`FRONTEND_PORT=8081` is not needed for the Docker image. The image serves built frontend files directly through the web entrypoint.

## Troubleshooting

If the home page loads but opening a session fails:

1. Check `docker compose logs -f`.
2. Make sure `.env` keeps `GATEWAY_PORT=8080` unless you intentionally changed the image internals.
3. Make sure your browser opens `http://<server-ip>:<HOST_PORT>`.
4. Confirm the SSH key mount path exists on the host.

If port `8888` is already in use:

1. Pick another `HOST_PORT`, such as `8899`.
2. Restart with `docker compose up -d`.

## Source Build Instead Of GHCR

If you are deploying from a local checkout instead of pulling `ghcr.io/un4gt/zed-web:latest`, replace the start step with:

```bash
docker compose build
docker compose up -d
```
