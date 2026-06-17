---
id: frontend-stack
title: 前端 UI 技术栈
description: zed-web 前端的构建工具、核心库和 UI 模块。
sidebar_position: 3
---

前端位于 `zed-web-frontend/`，入口是 `src/index.jsx -> src/App.jsx`。它是一个独立的 Rsbuild + React 应用，使用 Bun 安装依赖和运行脚本。

## 构建与运行

- **Bun**：依赖安装和脚本运行。
- **Rsbuild**：开发服务器、生产构建和静态预览。
- **React 19**：UI 渲染。
- **Zustand**：workbench、tabs、panels、session 等状态管理。

常用命令：

```bash
cd zed-web-frontend
bun install
bun run dev
bun run build
bun run preview
```

## 编辑器与工作台

- **Monaco Editor**：代码编辑器、语言模式和模型编辑事件。
- **Working copy / buffer runtime**：维护打开文件、dirty 状态、pending change batches、save/revert/sync 入口。
- **Command WebSocket client**：`src/lib/sessionCommandClient.js` 封装 `buffer.open`、`buffer.save`、`buffer.sync`、`tree.list` 和 `session.reconnect`。
- **Project tree**：通过 gateway 的 `tree.list` 展示远程目录。
- **xterm.js**：提供浏览器终端视图。

## 内容渲染与安全

- **marked**：Markdown 解析。
- **DOMPurify**：预览内容清理，避免直接渲染不可信 HTML。
- **@pierre/trees**：文件图标和语言相关资源。

## UI 组织

主要模块包括：

- `components/workbench/`：工作台容器。
- `components/editor/`：编辑器、tab、Markdown preview 和空状态。
- `components/project/`：项目树和 session 信息。
- `components/terminal/`：终端面板。
- `components/command/`：命令面板。
- `components/shell/` 和 `components/panels/`：标题栏、底栏、侧栏和 panel 布局。

## 本地开发注意事项

- `bun run dev` 会启动 Rsbuild 开发服务器，并尝试打开浏览器。
- Docker 部署不使用 `FRONTEND_PORT`；裸部署的本地 preview 脚本才使用它。
- 当前仓库没有根级 frontend build 命令，必须进入 `zed-web-frontend/` 执行 Bun 命令。
