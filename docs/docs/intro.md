---
id: intro
slug: /
title: 项目介绍
description: zed-web 的目标、组件边界和运行模型。
sidebar_position: 1
---

zed-web 是一个面向浏览器的远程 Zed 工作台。用户在浏览器里连接 gateway，gateway 通过 SSH 进入目标机器，启动或复用 Zed remote server proxy，然后把项目树、文件编辑、终端和会话状态暴露给前端。

## 组件

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

- **前端**：React/Rsbuild 应用，负责连接表单、项目树、编辑器、终端、命令面板和主题。
- **gateway-server**：Actix Web 服务，提供静态前端资源、HTTP API、WebSocket command channel、Basic Auth 和 SSH/zed proxy 编排。
- **目标机器**：真实项目所在机器。gateway 只需要能从部署环境通过 SSH 访问它。
- **Zed remote server proxy**：优先用于打开和保存 buffer，提供 Zed 原生的 buffer 版本信息；失败或超时时，gateway 回退到 SSH 文件读写路径。

## 主要能力

- 通过 SSH 打开远程项目目录。
- 浏览远程项目树并打开文本文件。
- 使用 working copy 模型记录本地编辑，并用增量变更保存。
- 保存前校验远端资源版本，远端已变化时返回冲突而不是覆盖。
- 在同一个 web 入口后提供前端静态文件、API 和 WebSocket。

## 部署形态

推荐部署方式是单容器 Docker 镜像：镜像内包含 `gateway-server`、构建后的前端、`openssh-client` 和 Caddy。Caddy 监听容器端口 `80`，再把请求代理到内部的 gateway。

裸部署适合本地开发或自托管运行：前端用 Bun 构建或预览，gateway 用 Cargo 构建并运行。
