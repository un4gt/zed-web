---
title: Bare Deployment
description: Run or deploy zed-web without Docker.
sidebar_position: 5
---

Bare deployment is useful for local development, gateway debugging, or running zed-web under your own process manager.

## Prerequisites

- Bun
- Rust toolchain
- `openssh-client`

The repository root is not a unified build workspace. Frontend commands must run inside `zed-web-frontend/`, and gateway commands must run inside `zed-web-gateway/`.

## Local Run Scripts

Start the gateway:

```bash
./scripts/run-gateway.sh
```

Start frontend preview:

```bash
./scripts/run-frontend.sh
```

Start both:

```bash
./scripts/run-local.sh
```

Default ports:

- gateway: `127.0.0.1:8080`
- frontend preview: `127.0.0.1:8081`

## Manual Build

Build the frontend:

```bash
cd zed-web-frontend
bun install
bun run build
```

Build the gateway:

```bash
cd zed-web-gateway
cargo build --release --locked -p gateway-server
```

## Production Run

Let the gateway serve the built frontend:

```bash
FRONTEND_DIR=/absolute/path/to/zed-web-frontend/dist \
GATEWAY_HOST=127.0.0.1 \
GATEWAY_PORT=8080 \
ZED_WEB_DATA_DIR=/var/lib/zed-web \
ZEW_USERNAME=admin \
ZEW_PASSWORD=change-this-password \
./zed-web-gateway/target/release/gateway-server
```

If `ZEW_USERNAME` and `ZEW_PASSWORD` are both unset, the gateway disables Basic Auth. Use that only for local development. Set both before exposing the gateway to a network.

## Environment Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `GATEWAY_HOST` | `127.0.0.1` | Gateway bind address. |
| `GATEWAY_PORT` | `8080` | Gateway bind port. |
| `FRONTEND_DIR` | `../frontend` | Frontend static asset directory served by gateway. |
| `ZED_WEB_DATA_DIR` | `/var/lib/zed-web` or script-local `.local/share/zed-web` | Managed remote-server cache and runtime data. |
| `FRONTEND_PORT` | `8081` | Only used by `scripts/run-frontend.sh`. |
| `ZEW_USERNAME` | unset | Basic Auth username. |
| `ZEW_PASSWORD` | unset | Basic Auth password. |

## Target Host Requirements

The gateway runtime must be able to reach the target machine over SSH. The target machine needs:

- Reachable SSH.
- A login-capable SSH user.
- Read access to `project_path`.
- Write access if you want to save edited files.

The remote server policy can be selected in the frontend connection form: `Latest`, `Pinned`, or `Disabled`.
