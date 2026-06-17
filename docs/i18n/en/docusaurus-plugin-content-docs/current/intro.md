---
id: intro
slug: /
title: Project Overview
description: zed-web goals, component boundaries, and runtime model.
sidebar_position: 1
---

zed-web is a browser-based remote Zed workbench. Users connect from the browser to the gateway. The gateway connects to a target machine over SSH, starts or reuses the Zed remote server proxy, and exposes project trees, file editing, terminals, and session state to the frontend.

## Components

```text
Browser UI
  |
  | HTTP / WebSocket
  v
gateway-server
  |
  | outbound SSH
  v
target host
  |
  | zed-remote-server proxy
  v
project files
```

- **Frontend**: a React/Rsbuild app for the connection form, project tree, editor, terminal, command palette, and themes.
- **gateway-server**: an Actix Web service that serves the frontend, HTTP API, WebSocket command channel, Basic Auth, and SSH/Zed proxy orchestration.
- **Target host**: the machine that owns the real project files. The gateway only needs outbound SSH access to it.
- **Zed remote server proxy**: preferred for opening and saving buffers because it provides native Zed buffer version information. When it fails or times out, the gateway falls back to SSH file reads and writes.

## Main Capabilities

- Open a remote project directory over SSH.
- Browse the remote project tree and open text files.
- Track local edits through a working copy model and save incremental changes.
- Validate the remote resource version before saving, returning a conflict instead of overwriting remote changes.
- Serve frontend assets, API routes, and WebSocket routes behind one web entrypoint.

## Deployment Shapes

The recommended deployment is a single Docker image containing `gateway-server`, the built frontend, `openssh-client`, and Caddy. Caddy listens on container port `80` and proxies requests to the internal gateway.

Bare deployment is useful for local development or self-managed runtime environments: build or preview the frontend with Bun, and build or run the gateway with Cargo.
