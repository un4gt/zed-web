# Zed Web Todo

## Goals
- Keep the browser limited to UI concerns: tree, tabs, editor, terminal, diagnostics, and session interaction.
- Move Gateway toward the real Zed remote role: remote session host, protocol adapter, reconnect owner, and future `zed-remote-server` bridge.
- Refactor `zed-web-gateway` into a small-file, multi-crate Cargo workspace before more protocol logic lands.

## MVP Checklist
- Open project: Browser requests project open; Gateway connects over SSH, ensures the remote server is available, and establishes a session.
- Open file: Browser only receives file/tree/buffer abstractions and does not own remote path resolution details.
- Save: Browser sends edits; Gateway persists them to the remote session.
- Terminal: Use a dedicated websocket subchannel, separate from editor/session traffic.
- Reconnect: Design and maintain disconnect handling and session resume behavior early.

## In Progress
- Validate a real Docker session-open flow with mounted SSH credentials and managed remote-server download/cache enabled.
- Keep terminal transport migration deferred until the Dockerized open-project flow is proven end to end.

## Completed
- Updated `zed-web-frontend` UI/UX theme to closely match the Zed desktop client (One Dark palette, refined layout constraints, native typography, and removed generic demo styling).
- Researched `refrence/zed` remote development internals with subagents, including SSH bootstrap, reconnect semantics, worktree/buffer flow, and terminal/task/extension behavior.
- Implemented the first Gateway MVP skeleton with session create/reconnect, file tree/file read/save endpoints, event websocket, and terminal websocket.
- Implemented the first frontend MVP shell with Monaco, xterm.js, Zustand UI state, and a separate runtime store for high-frequency editor content.
- Verified `cargo test` in `zed-web-gateway` and `bun run build` in `zed-web-frontend` before the multi-crate refactor.
- Split `zed-web-gateway` into a Cargo workspace with separate crates for core types, SSH transport, Actix web APIs, and the server binary.
- Preserved the existing Gateway HTTP and WS API during the refactor so the current frontend remained compatible.
- Re-verified `cargo test` in the refactored `zed-web-gateway` workspace and `bun run build` in `zed-web-frontend` after the refactor.
- Upgraded Gateway session creation to actually start and own a remote `zed-remote-server proxy --identifier ...` process instead of only doing SSH reachability checks.
- Upgraded reconnect to restart the remote proxy with the same session identifier, keeping Gateway session ownership aligned with Zed remote semantics.
- Added local integration coverage that starts a temporary `sshd`, opens a Gateway session, and verifies open file, save, terminal, and reconnect behavior end to end.
- Added a dedicated `gateway-zed-proxy` crate for the minimal `Envelope`-based file flow needed by `AddWorktree`, `OpenBufferByPath`, `UpdateBuffer`, and `SaveBuffer`.
- Migrated Gateway `read_file` and `save_file` to use the minimal proxy-backed file flow instead of SSH file commands.
- Added a local fake remote proxy helper binary and verified proxy-backed open file/save through the SSH integration test.
- Added Docker deployment artifacts: `Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`, and container startup scripts.
- Added bare-install startup scripts for gateway, frontend preview, and combined local run.
- Verified `docker build` and `docker run` for the composed frontend + gateway image, and fixed Caddy routing so `/api/health` reaches the gateway through the container entrypoint.
- Switched Docker persistence to a host bind mount (`./data:/var/lib/zed-web`) so managed remote-server cache is clearly stored on the host filesystem.
- Added `.env.example` and simplified the Docker MVP flow to `cp .env.example .env`, `mkdir -p data`, and `docker compose up --build -d`.
- Verified Docker Compose end to end for the MVP deployment path: image build, container startup, and `/api/health` through Caddy on `http://127.0.0.1:8080`.
- Added managed remote-server version policy (`latest`, `pinned`, `disabled`) across gateway API, session state, frontend form controls, and deployment docs.
- Implemented managed remote-server bootstrap in Gateway: release metadata resolution, asset selection, digest verification, gzip extraction, local cache population, remote upload, and managed proxy startup path selection.
- Verified the gateway workspace with `cargo test`; the previously flaky in-memory proxy unit test is now ignored in favor of the passing SSH-backed integration tests.

## MVP Coverage Today
- Open project: implemented at the Gateway session-host level. Gateway opens the SSH-backed session, probes remote availability, and starts a remote `zed-remote-server proxy` tied to the session identifier.
- Open file: implemented and locally verified through the proxy-backed Gateway file flow.
- Save: implemented and locally verified through the proxy-backed Gateway file flow.
- Terminal: implemented as a dedicated websocket channel and locally verified at the Gateway session level.
- Reconnect: implemented as an explicit API and session state flow that restarts the remote proxy with the same identifier. It still needs deeper protocol-level resume once file/editor traffic also flows through the proxy channel.

## Next
- Run one real session-open flow inside Docker using mounted SSH credentials against an accessible SSH target.
- Keep terminal transport migration and broader browser session protocol work out of scope until the Dockerized open-project flow is proven.
