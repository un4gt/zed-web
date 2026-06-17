---
id: zed-server-communication
title: 与 zed-server 通讯
description: 浏览器、gateway、SSH 和 Zed remote server proxy 之间的通讯流程。
sidebar_position: 2
---

本文把目标机器上的 `zed-remote-server proxy` 简称为 zed-server。浏览器不会直接连接 zed-server；所有请求都先进入 gateway，再由 gateway 通过 SSH 管理远端进程和文件操作。

## 会话创建

前端调用 gateway 的 session API，提交 SSH 目标、端口、用户、项目路径和 remote server 策略。gateway 会：

1. 校验 `host` 和 `project_path`。
2. 根据策略选择 remote server 版本：`latest`、`pinned` 或 `disabled`。
3. 通过 SSH 探测目标机器并启动 `zed-remote-server proxy`。
4. 初始化 Zed proxy client，并把项目路径加入 worktree。
5. 返回 session snapshot，前端之后使用这个 session id 建立命令 WebSocket。

## Command WebSocket

编辑器和项目树使用同一个命令通道：

```text
/api/sessions/{session_id}/commands
```

每个请求都是 JSON envelope：

```json
{
  "id": "1",
  "type": "buffer.open",
  "payload": {
    "path": "src/main.rs"
  }
}
```

gateway 用相同的 `id` 返回一个或多个响应。终止响应的 `type` 通常以 `.complete` 结尾；错误统一返回 `type: "error"`。

## Buffer open

`buffer.open` 用于打开可编辑文本 buffer。gateway 会优先走 zed-server proxy，失败或超时后回退到 SSH 文件读取。

响应顺序：

```text
buffer.open.started
buffer.chunk*
buffer.open.complete
```

`buffer.chunk` 使用 base64 编码传输文本片段，`buffer.open.complete` 返回：

- `bytes_read`
- `truncated`
- `read_only`
- `resource_version`

`resource_version` 对前端是不透明 token，当前有两类：

- `zed-vector-clock`：来自 zed-server buffer 版本。
- `ssh-stat`：SSH fallback 路径生成的内容版本。

## Buffer save

前端保存时发送 `buffer.save`，只发送增量变更，不发送全文：

```json
{
  "path": "src/main.rs",
  "base_resource_version": {
    "scheme": "zed-vector-clock",
    "value": "opaque"
  },
  "batches": [],
  "expected_content_length": 1280
}
```

gateway 会先读取当前远端版本，并和 `base_resource_version` 比较：

- 版本相同：按 batch 顺序应用文本 edits，然后保存。
- 版本不同：返回 `status: "conflict"`，不写入远端文件。

保存成功响应会返回 `applied_seq`、`bytes_written` 和新的 `resource_version`。冲突响应会尽量返回当前远端版本和说明信息，前端保留本地 dirty buffer。

## Buffer sync

`buffer.sync` 用于前端重连、恢复或显式同步时检查远端状态。请求中包含每个 buffer 的路径、base version、dirty 状态和最后一个 seq。响应状态包括：

- `unchanged`：远端版本未变化。
- `remote_changed`：远端版本已经变化。
- `missing`：gateway 无法读取该路径。

## 相关命令

- `tree.list`：列出项目树。
- `session.reconnect`：用同一个 session identifier 重启远端 proxy。
- `file.open` / `file.save`：旧接口，保留为兼容 fallback；新的编辑器路径使用 `buffer.*`。

## 设计约束

- AI 编辑、用户输入和恢复后的 dirty buffer 都必须进入 working copy，再经 `buffer.save` 保存。
- 前端不直接绕过 gateway 写文件。
- gateway 在检测到远端版本变化时不做自动三方合并，也不覆盖远端。
