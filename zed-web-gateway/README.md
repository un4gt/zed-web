# zed-web-gateway

## Release outputs

Tag pushes matching `v.*` trigger `.github/workflows/release.yml`.

The workflow publishes:

- a Docker image to `ghcr.io/<owner>/<repo>`
- a bare-install tarball attached to the GitHub release

The bare-install tarball contains:

- `bin/gateway-server`
- `frontend/` built static assets
- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `deploy/`
- `scripts/`
- `README.md`

## Local packaging

You can build the bare-install release artifact locally with:

```bash
./scripts/package-release.sh v0.0.0
```
