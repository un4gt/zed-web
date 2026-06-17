---
id: frontend-stack
title: Frontend UI Stack
description: zed-web frontend build tools, core libraries, and UI modules.
sidebar_position: 3
---

The frontend lives in `zed-web-frontend/`. Its entry flow is `src/index.jsx -> src/App.jsx`. It is a standalone Rsbuild + React application that uses Bun for dependency installation and scripts.

## Build And Runtime

- **Bun**: dependency installation and script runner.
- **Rsbuild**: dev server, production build, and static preview.
- **React 19**: UI rendering.
- **Zustand**: state for the workbench, tabs, panels, sessions, and UI state.

Common commands:

```bash
cd zed-web-frontend
bun install
bun run dev
bun run build
bun run preview
```

## Editor And Workbench

- **Monaco Editor**: code editor, language modes, and model change events.
- **Working copy / buffer runtime**: tracks open files, dirty state, pending change batches, save/revert/sync entrypoints.
- **Command WebSocket client**: `src/lib/sessionCommandClient.js` wraps `buffer.open`, `buffer.save`, `buffer.sync`, `tree.list`, and `session.reconnect`.
- **Project tree**: renders remote directories through gateway `tree.list`.
- **xterm.js**: browser terminal view.

## Content Rendering And Safety

- **marked**: Markdown parsing.
- **DOMPurify**: sanitizes preview content before rendering untrusted HTML.
- **@pierre/trees**: file icons and language-related resources.

## UI Organization

Main modules:

- `components/workbench/`: workbench shell.
- `components/editor/`: editor, tabs, Markdown preview, and empty states.
- `components/project/`: project tree and session details.
- `components/terminal/`: terminal panel.
- `components/command/`: command palette.
- `components/shell/` and `components/panels/`: title bar, bottom bar, sidebars, and panel layout.

## Local Development Notes

- `bun run dev` starts the Rsbuild dev server and tries to open a browser.
- Docker deployment does not use `FRONTEND_PORT`; only the bare local preview script uses it.
- There is no root-level frontend build command. Run Bun commands inside `zed-web-frontend/`.
