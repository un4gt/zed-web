---
title: Docker 部署
description: 使用官方镜像或源码构建 zed-web 单容器部署。
sidebar_position: 4
---

推荐部署方式是 Docker Compose。镜像内包含：

- `gateway-server`
- 构建后的 React 前端静态资源
- `openssh-client`
- Caddy

Caddy 监听容器端口 `80`，并把所有 HTTP、静态资源、API 和 WebSocket 请求代理到容器内部的 gateway。

## 准备配置

```bash
cp .env.example .env
mkdir -p data
```

编辑 `.env`，至少设置：

```dotenv
ZEW_USERNAME=admin
ZEW_PASSWORD=change-this-password
```

Docker 部署要求这两个值都存在且非空；它们会保护页面、静态资源、API 和 WebSocket 握手。

## 使用发布镜像启动

```bash
docker compose pull
docker compose up -d
```

默认访问地址：

```text
http://127.0.0.1:4173
```

如果要改变宿主机公开端口，只改 `HOST_PORT`：

```dotenv
HOST_PORT=8888
```

## 从源码构建

```bash
docker compose build zed-web
docker compose up -d zed-web
```

依赖或 Dockerfile 变化后可以做干净构建：

```bash
docker compose build --no-cache zed-web
docker compose up -d zed-web
```

## 关键环境变量

| 变量 | 作用 |
| --- | --- |
| `ZED_WEB_IMAGE` | Compose 使用的镜像，默认 `ghcr.io/un4gt/zed-web:latest`。 |
| `HOST_PORT` | 宿主机公开 HTTP 端口，默认 `4173`。 |
| `GATEWAY_HOST` | 容器内 gateway 绑定地址，默认 `127.0.0.1`。 |
| `GATEWAY_PORT` | 容器内 gateway 端口，默认 `8080`。 |
| `ZEW_USERNAME` | HTTP Basic Auth 用户名。 |
| `ZEW_PASSWORD` | HTTP Basic Auth 密码。 |
| `ZED_WEB_DATA_PATH` | 宿主机 runtime/cache 数据目录，默认 `./data`。 |
| `ZED_WEB_SSH_PATH` | 宿主机 SSH 配置和密钥目录，默认 `${HOME}/.ssh`。 |

容器内 runtime 数据目录固定为 `/var/lib/zed-web`。

## SSH 访问

容器只需要 outbound SSH，不需要宿主机运行 SSH server。默认 Compose 会把 SSH 目录只读挂载到容器：

```yaml
- ${ZED_WEB_SSH_PATH:-${HOME}/.ssh}:/root/.ssh:ro
```

如果使用 SSH agent，Compose 会把 `SSH_AUTH_SOCK` 挂到 `/ssh-agent`。

连接 Docker 宿主机时，SSH host 可以填：

```text
host.docker.internal
```

连接其他机器时，填写那台机器的 DNS 名称或 IP。

## 验证

```bash
curl -fsS -u "$ZEW_USERNAME:$ZEW_PASSWORD" \
  http://127.0.0.1:${HOST_PORT:-4173}/api/health
```

期望响应：

```json
{"ok":true}
```

之后在浏览器中打开页面，填写 SSH host、user、port 和 project path，打开项目、编辑文件并保存。
