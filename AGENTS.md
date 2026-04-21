# AGENTS.md

## Workspace
- `/home/rust_workspace/zed-web` is an umbrella folder, not a buildable root workspace: there is no root `package.json`, `Cargo.toml`, lockfile, CI config, or git repo. Run commands inside the target subproject.
- Do not assume shared tooling or a root build/test command across `zed-web-frontend/`, `zed-web-gateway/`, and `refrence/zed/`.
- Nested instruction files exist and are more specific than this one: `zed-web-frontend/AGENTS.md`, `refrence/zed/AGENTS.md`, and `refrence/zed/docs/AGENTS.md`.
- Only `zed-web-gateway/` is a git repo in this checkout. `git` commands fail at the workspace root and in `zed-web-frontend/`.

## zed-web-frontend
- Standalone Rsbuild + React app. Entry flow is `src/index.jsx` -> `src/App.jsx`.
- Use Bun here. Repo-defined commands are `bun install`, `bun run dev`, `bun run build`, and `bun run preview`.
- Install dependencies before any frontend build/dev command; in a clean environment `bun run build` fails until `bun install` provides `rsbuild`.
- `bun run dev` uses `rsbuild dev --open`, so it will try to launch a browser.
- `package.json` defines no `test`, `lint`, or `typecheck` scripts. The only repo-local automated verification command here is `bun run build`.

## zed-web-gateway
- Standalone Cargo binary crate. Current code is just `src/main.rs`; there is no workspace layout or extra tooling config yet.
- Run normal Cargo commands from this directory. `cargo test` currently succeeds and runs 0 tests.

## refrence/zed
- The directory name is spelled `refrence/`, not `reference/`.
- `refrence/zed/` is a separate upstream Zed checkout with its own Cargo workspace, CI workflows, and local `AGENTS.md` files.
- No root config ties `refrence/zed/` into the frontend or gateway builds. Ignore it unless the task explicitly targets that tree.
