# ecs-vm-demo

An Express application deployed to AWS ECS and an on-premises office VM via a single GitHub Actions pipeline. Uses Docker for packaging and nginx as a reverse proxy, with protocol-aware routing to handle both HTTP and HTTPS clients on the same port.

## Stack

- **Runtime** — Node.js 20, Express 5
- **Container** — Docker (Alpine base), served behind nginx
- **CI/CD** — GitHub Actions with OIDC-based AWS auth (no long-lived keys)
- **Cloud** — AWS ECS (Fargate), ECR, ALB
- **On-prem** — Self-hosted GitHub Actions runner on office VM, nginx reverse proxy

## Architecture

```
Client
  └── nginx (reverse proxy)
        ├── HTTP  → Express :3000
        └── HTTPS → Express :3000   (TLS terminated at nginx)

Express (index.js)
  ├── GET /health, /ready           # liveness + readiness probes
  ├── GET /version                  # build metadata
  ├── GET /metrics                  # uptime, request count, memory (token-protected)
  └── express.static → public/      # static assets
```

No build step — static assets are served as-is from `public/`. The Dockerfile copies the repo and runs `node index.js`.

## HTTP + HTTPS on a Single Port

The office VM sits behind a corporate firewall that forwards one external port to the VM. Mobile browsers (HTTPS-first mode) and desktop browsers (plain HTTP) both arrive on that same port.

nginx uses the `stream` module with `ssl_preread on` to detect the protocol at the TCP layer before the HTTP request is read:

- **TLS ClientHello detected** → routed to the HTTPS server block (TLS terminated with a self-signed cert)
- **Plain HTTP** → routed to the HTTP server block

Both blocks proxy upstream to Express. The self-signed cert is generated at deploy time by the CI pipeline using `openssl` — no manual certificate management required.

## API Endpoints

| Route | Description |
|---|---|
| `GET /health` | Liveness probe — returns `{"status":"healthy"}` |
| `GET /ready` | Readiness probe |
| `GET /version` | App name, version, Node environment |
| `GET /metrics` | Uptime, request count, memory usage, load average |

`/metrics` requires `Authorization: Bearer <token>` when `METRICS_TOKEN` is set.

## CI/CD Pipeline

Pushes to `main` trigger `.github/workflows/deploy.yml`:

1. **Build & Scan** — `npm ci`, validate, lint, format check, `npm audit`, Docker build, Trivy CRITICAL scan
2. **Push to ECR** — image tagged with commit SHA, pushed to Amazon ECR
3. **Deploy to ECS** — new task definition registered, ECS service updated, waits for stability
4. **Deploy to Office VM** — self-hosted runner pulls image from ECR, restarts app container and nginx

Jobs 3 and 4 run in parallel after job 2.

### Code Quality Gates (CI)

Every push must pass before the Docker build runs:

| Check | Tool |
|---|---|
| Export validation | `node -e` smoke test |
| Lint | ESLint (flat config, env-aware globals) |
| Formatting | Prettier |
| Dependency audit | `npm audit --audit-level=high` |
| Image scan | Trivy (CRITICAL CVEs fail the build) |

Pre-commit hooks (Husky + lint-staged) run ESLint and Prettier on staged files locally before each commit.

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `AWS_ROLE_ARN` | IAM role for OIDC auth (no static keys) |
| `AWS_REGION` | Target AWS region |
| `ECR_REPOSITORY` | ECR repository name |
| `ECS_CLUSTER` | ECS cluster name |
| `ECS_SERVICE` | ECS service name |
| `ECS_TASK_DEFINITION` | Task definition family name |
| `ECS_CONTAINER_NAME` | Container name in the task definition |
| `METRICS_TOKEN` | Bearer token for `/metrics` (optional) |

## Local Development

```bash
npm install
npm start        # starts Express on the default port
npm test         # validates server exports load correctly
npm run lint     # ESLint
npm run format   # Prettier
```

### Docker

```bash
docker build -t ecs-vm-demo .
docker run --rm -p 3000:3000 ecs-vm-demo
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP listen port |
| `APP_NAME` | `ecs-vm-demo` | Identifier used in logs |
| `NODE_ENV` | `production` | Node environment |
| `METRICS_TOKEN` | _(unset)_ | Protects `/metrics` when set |
