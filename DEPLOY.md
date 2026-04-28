# zew Deployment

This deployment runs zew as one container:

- Caddy serves the built React frontend on container port `80`.
- Caddy proxies `/api/*` and websocket routes to `gateway-server`.
- `gateway-server` listens only inside the container on `127.0.0.1:${GATEWAY_PORT}`.
- The gateway opens outbound SSH connections to the target machine.

The browser should only open the public web entrypoint:

```text
http://<server-ip>:<HOST_PORT>
```

Do not open the internal gateway port directly in normal Docker deployments.

## Files

Keep these files together on the deployment host:

- `docker-compose.yml`
- `.env.example`

Create local configuration and persistent runtime storage:

```bash
cp .env.example .env
mkdir -p data
```

## Port Model

There are two ports with different jobs:

- `HOST_PORT`: the public port on the Docker host.
- `GATEWAY_PORT`: the private port used by `gateway-server` inside the container.

Recommended values:

```dotenv
HOST_PORT=4173
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=8080
```

Why `GATEWAY_HOST=127.0.0.1`:

- Caddy and `gateway-server` run in the same container.
- Caddy proxies `/api/*` to `127.0.0.1:${GATEWAY_PORT}`.
- The backend does not need to be exposed separately on the container network.

If you want the app reachable at `http://host:8888`, change only:

```dotenv
HOST_PORT=8888
```

Leave `GATEWAY_PORT=8080` unless you are intentionally changing container internals.

## Environment

Example `.env`:

```dotenv
ZED_WEB_IMAGE=ghcr.io/un4gt/zed-web:latest
HOST_PORT=4173
GATEWAY_HOST=127.0.0.1
GATEWAY_PORT=8080
ZED_WEB_DATA_PATH=./data
ZED_WEB_SSH_PATH=${HOME}/.ssh
```

Variables:

- `ZED_WEB_IMAGE`: image used by Compose.
- `HOST_PORT`: public HTTP port on the Docker host.
- `GATEWAY_HOST`: internal gateway bind address. Use `127.0.0.1` for the bundled image.
- `GATEWAY_PORT`: internal gateway port. Default `8080`.
- `ZED_WEB_DATA_PATH`: host directory for managed remote-server cache and runtime data.
- `ZED_WEB_SSH_PATH`: host SSH config/key directory mounted read-only at `/root/.ssh`.

`FRONTEND_PORT` is not used by the Docker image. It only applies to the bare local preview scripts.

## Start From Published Image

Use the published image:

```bash
docker compose pull
docker compose up -d
```

Check status:

```bash
docker compose ps
docker compose logs -f zed-web
```

Open:

```text
http://127.0.0.1:4173
```

or, if you changed `HOST_PORT`:

```text
http://<server-ip>:<HOST_PORT>
```

## Build From Source

Use this when deploying local code changes:

```bash
docker compose build zed-web
docker compose up -d zed-web
```

Force a clean rebuild when dependency or Dockerfile changes are involved:

```bash
docker compose build --no-cache zed-web
docker compose up -d zed-web
```

Verify the new backend is active:

```bash
curl -fsS http://127.0.0.1:${HOST_PORT:-4173}/api/health
```

Expected response:

```json
{"ok":true}
```

The gateway should return JSON errors, not HTML or plain text. For example:

```bash
curl -i -X POST "http://127.0.0.1:${HOST_PORT:-4173}/api/sessions" \
  -H "Content-Type: application/json" \
  -d '{"host":"","project_path":"/tmp","remote_server":{"mode":"disabled"}}'
```

Expected shape:

```json
{"error":"host is required"}
```

## Web Connection Settings

When using the Docker deployment page, leave `Gateway URL` as the same origin unless you are intentionally connecting to another gateway:

```text
http://<server-ip>:<HOST_PORT>
```

For local source preview on Rsbuild port `4173`, Rsbuild proxies `/api/*` to:

```text
http://127.0.0.1:8080
```

The web UI itself defaults `Gateway URL` to the same origin as the page. In Docker this keeps API and websocket traffic on `http://<server-ip>:<HOST_PORT>` and lets Caddy proxy it internally. In local source preview this works because the Rsbuild server proxies `/api/*`.

Use these SSH host values depending on where the gateway container should connect:

- Connect to the Docker host: `host.docker.internal`
- Connect to another machine: that machine's DNS name or IP address
- Connect to an SSH server running inside another container: use its Compose service name on a shared Docker network

Example for connecting from the container to the Docker host as root:

```text
Gateway URL: http://<server-ip>:<HOST_PORT>
SSH host: host.docker.internal
SSH user: root
Project path: /tmp
Server: Latest
```

The mounted SSH directory must contain keys and config that let the container's root user authenticate to the target host.

## SSH Requirements

The container includes `openssh-client`; it does not run an SSH server.

The target host must have:

- SSH reachable from the container.
- The requested SSH user allowed to log in.
- The requested `Project path` readable by that user.
- Write permissions if you want to save edited files.

For key-based authentication, keep the key material under `ZED_WEB_SSH_PATH` on the Docker host. It is mounted read-only:

```yaml
- ${ZED_WEB_SSH_PATH:-${HOME}/.ssh}:/root/.ssh:ro
```

If you use an SSH agent, Compose also mounts the host agent socket to `/ssh-agent` when `SSH_AUTH_SOCK` is set.

## Remote Server Policy

The open-project form supports:

- `Latest`: use the default managed Zed remote-server release.
- `Pinned`: use a specific release tag, such as `v0.232.3`.
- `Disabled`: skip managed updates and use the configured remote binary path directly.

Managed remote-server files are cached under:

```text
/var/lib/zed-web
```

In Compose this maps to:

```text
${ZED_WEB_DATA_PATH:-./data}
```

## Validate The Edit Flow

After the container is running:

1. Open `http://<server-ip>:<HOST_PORT>`.
2. Confirm `Gateway URL` points to the public web entrypoint.
3. Enter SSH host, user, port, and project path.
4. Click `Open`.
5. Open a file from the project tree.
6. Edit the file.
7. Click `Save`.
8. Confirm the file changed on the target host.

The first screen does not open the terminal by default. Use the terminal activity button only when you want to attach one.

## Troubleshooting

If the page loads but `Open` fails with HTML or JSON parse errors:

- Rebuild and restart the container after code changes:

```bash
docker compose build zed-web
docker compose up -d zed-web
```

- Confirm `/api/health` goes through the same public URL as the frontend:

```bash
curl -i http://127.0.0.1:${HOST_PORT:-4173}/api/health
```

- Confirm Caddy is serving the frontend and proxying `/api/*`:

```bash
docker compose logs -f zed-web
```

If SSH connection fails:

- Check that `ZED_WEB_SSH_PATH` exists on the host.
- Check key permissions and known hosts.
- From inside the container, test SSH manually:

```bash
docker compose exec zed-web ssh root@host.docker.internal
```

If the selected host port is already in use:

```dotenv
HOST_PORT=8899
```

Then restart:

```bash
docker compose up -d
```

If edited files do not save:

- Verify the SSH user can write to the selected project path.
- Check `docker compose logs -f zed-web` for gateway errors.
- Confirm the frontend is using the Docker web entrypoint, not an old Rsbuild preview URL.
