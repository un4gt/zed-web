---
title: 裸部署
description: 不使用 Docker 时如何本地运行或部署 zed-web。
sidebar_position: 5
---

裸部署适合本地开发、调试 gateway，或在已有进程管理器中运行 zed-web。

## 前置条件

- Bun
- Rust toolchain
- `openssh-client`

本仓库根目录不是统一的 build workspace。前端命令需要进入 `zed-web-frontend/`，gateway 命令需要进入 `zed-web-gateway/`。

## 本地运行脚本

启动 gateway：

```bash
./scripts/run-gateway.sh
```

启动前端 preview：

```bash
./scripts/run-frontend.sh
```

同时启动两者：

```bash
./scripts/run-local.sh
```

默认端口：

- gateway：`127.0.0.1:8080`
- frontend preview：`127.0.0.1:8081`

## 手动构建

构建前端：

```bash
cd zed-web-frontend
bun install
bun run build
```

构建 gateway：

```bash
cd zed-web-gateway
cargo build --release --locked -p gateway-server
```

## 生产运行

让 gateway 直接服务构建后的前端：

```bash
FRONTEND_DIR=/absolute/path/to/zed-web-frontend/dist \
GATEWAY_HOST=127.0.0.1 \
GATEWAY_PORT=8080 \
ZED_WEB_DATA_DIR=/var/lib/zed-web \
ZEW_USERNAME=admin \
ZEW_PASSWORD=change-this-password \
./zed-web-gateway/target/release/gateway-server
```

如果 `ZEW_USERNAME` 和 `ZEW_PASSWORD` 都不设置，gateway 会禁用 Basic Auth。只建议本地开发这样做；暴露到网络前必须设置两者。

## 环境变量

| 变量 | 默认值 | 作用 |
| --- | --- | --- |
| `GATEWAY_HOST` | `127.0.0.1` | gateway 监听地址。 |
| `GATEWAY_PORT` | `8080` | gateway 监听端口。 |
| `FRONTEND_DIR` | `../frontend` | gateway 服务的前端静态资源目录。 |
| `ZED_WEB_DATA_DIR` | `/var/lib/zed-web` 或脚本中的 `.local/share/zed-web` | managed remote-server cache 和 runtime 数据目录。 |
| `FRONTEND_PORT` | `8081` | 仅用于 `scripts/run-frontend.sh`。 |
| `ZEW_USERNAME` | 未设置 | Basic Auth 用户名。 |
| `ZEW_PASSWORD` | 未设置 | Basic Auth 密码。 |

## 目标机器要求

gateway 运行环境必须能通过 SSH 访问目标机器。目标机器需要：

- SSH 可达。
- SSH 用户可登录。
- `project_path` 对该用户可读。
- 如果需要保存文件，该用户必须有写权限。

remote server 策略可以在前端连接表单中选择：`Latest`、`Pinned` 或 `Disabled`。
