FROM oven/bun:1 AS frontend-builder
WORKDIR /app/zed-web-frontend
COPY zed-web-frontend/package.json zed-web-frontend/bun.lock ./
RUN bun install --frozen-lockfile
COPY zed-web-frontend/ ./
RUN bun run build

FROM rust:1.94-bookworm AS gateway-builder
WORKDIR /app/zed-web-gateway
COPY zed-web-gateway/Cargo.toml ./
COPY zed-web-gateway/crates ./crates
RUN cargo build --release -p gateway-server

FROM caddy:2 AS caddy-runtime

FROM debian:bookworm-slim AS runtime
ENV GATEWAY_HOST=0.0.0.0
ENV GATEWAY_PORT=8080
ENV FRONTEND_PORT=8081
ENV ZED_WEB_DATA_DIR=/var/lib/zed-web

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl openssh-client bash \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /opt/zed-web/frontend /opt/zed-web/bin /etc/caddy /var/lib/zed-web

COPY --from=gateway-builder /app/zed-web-gateway/target/release/gateway-server /opt/zed-web/bin/gateway-server
COPY --from=frontend-builder /app/zed-web-frontend/dist /opt/zed-web/frontend
COPY --from=caddy-runtime /usr/bin/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY deploy/start-container.sh /opt/zed-web/bin/start-container.sh

RUN chmod +x /opt/zed-web/bin/gateway-server /opt/zed-web/bin/start-container.sh

EXPOSE 8080 8081 80
VOLUME ["/var/lib/zed-web"]

ENTRYPOINT ["/opt/zed-web/bin/start-container.sh"]
