# Project Handoff — ecs-vm-demo

**Repo:** `anantrajjj/ecs-vm-task`
**Last updated:** 2026-06-11
**Author:** Anantraj Prasad

---

## What This Is

An Express app (Node 20) containerised with Docker and deployed to two targets via a single GitHub Actions pipeline:

- **AWS ECS (Fargate)** — cloud target, sits behind an ALB
- **Office VM** — on-premises physical server, accessed via company firewall port forwarding, served through nginx

The frontend is a vanilla HTML5 Canvas game (no build step required). The backend exposes health, readiness, version, and metrics endpoints.

---

## Infrastructure

### AWS (ap-south-1)

| Resource | Detail |
|---|---|
| ECS Cluster | configured via `ECS_CLUSTER` secret |
| ECS Service | configured via `ECS_SERVICE` secret |
| Task Definition | configured via `ECS_TASK_DEFINITION` secret |
| ECR Repository | configured via `ECR_REPOSITORY` secret |
| ALB | `cc-task-alb-1195525536.ap-south-1.elb.amazonaws.com` |
| IAM Auth | OIDC — no static keys. Role ARN in `AWS_ROLE_ARN` secret |

### Office VM

| Component | Detail |
|---|---|
| Firewall mapping | External port → VM port 80 |
| App container | `ecs-vm-demo` on Docker network `cc-task-net`, no host port binding |
| nginx container | `cc-task-nginx`, port 80, mounts `nginx/nginx.conf` and `/tmp/nginx-ssl/` |
| Cloudflare tunnel | `cc-task-tunnel` — requires `CF_TUNNEL_TOKEN` secret (see below) |
| GitHub Actions runner | Self-hosted runner registered on the VM, used by `deploy-vm` job |

### Docker network

`cc-task-net` is a bridge network shared between `ecs-vm-demo` and `cc-task-nginx`. The app has no host port — only nginx can reach it by container name.

---

## HTTP + HTTPS on One Port

Mobile browsers (HTTPS-first mode) and desktop browsers (plain HTTP) both arrive on the same external port. nginx uses the `stream` module with `ssl_preread on` to detect the protocol at Layer 4:

- **TLS ClientHello** → routed to internal port 8443 (HTTPS server block, self-signed cert)
- **Plain HTTP** → routed to internal port 8080 (HTTP server block)

Both blocks proxy to `ecs-vm-demo:3000`. The self-signed cert is regenerated on every deploy via `openssl` in the CI pipeline. First-time visitors on mobile get a one-time certificate warning; after accepting it the site loads normally.

**To eliminate the warning permanently:** set up a Cloudflare Tunnel with a custom domain (see Pending section).

---

## CI/CD Pipeline

`.github/workflows/deploy.yml` — triggered on push to `main` or `workflow_dispatch`.

```
Build and Scan (ubuntu-latest)
  └── npm ci → validate → lint → format:check → npm audit → docker build → Trivy scan → upload artifact

Push to ECR (ubuntu-latest)
  └── download artifact → load → tag → push to ECR

Deploy to ECS (ubuntu-latest)          Deploy to VM (self-hosted)
  └── fetch task def → render → deploy    └── pull image → restart app → restart nginx → restart tunnel
```

Jobs 3 and 4 run in parallel after job 2.

### Code Quality Gates

Every push must pass before the Docker build runs:

| Gate | Command |
|---|---|
| Export validation | `npm test` |
| ESLint | `npm run lint` |
| Prettier | `npm run format:check` |
| Dependency audit | `npm audit --audit-level=high` |
| Trivy image scan | CRITICAL CVEs block the build |

Pre-commit hooks (Husky + lint-staged) enforce lint + format locally on staged files.

---

## GitHub Secrets Required

| Secret | Purpose |
|---|---|
| `AWS_ROLE_ARN` | IAM role for OIDC auth |
| `AWS_REGION` | AWS region (e.g. `ap-south-1`) |
| `ECR_REPOSITORY` | ECR repo name |
| `ECS_CLUSTER` | ECS cluster name |
| `ECS_SERVICE` | ECS service name |
| `ECS_TASK_DEFINITION` | Task definition family name |
| `ECS_CONTAINER_NAME` | Container name in the task definition |
| `METRICS_TOKEN` | Bearer token for `/metrics` (optional) |
| `CF_TUNNEL_TOKEN` | Cloudflare Tunnel token (optional — tunnel step runs but exits silently if unset) |

---

## API Endpoints

| Route | Description |
|---|---|
| `GET /health` | Liveness probe |
| `GET /ready` | Readiness probe |
| `GET /version` | App name, version, Node env |
| `GET /metrics` | Uptime, request count, memory (requires Bearer token if `METRICS_TOKEN` set) |

---

## Local Development

```bash
npm install    # also sets up Husky pre-commit hooks
npm start      # Express on port 3000
npm test       # validate exports
npm run lint
npm run format
```

### Docker (local)

```bash
docker build -t ecs-vm-demo .
docker run --rm -p 3000:3000 ecs-vm-demo
```

---

## VM Operations

### Check running containers

```bash
docker ps --filter name=cc-task
```

### View logs

```bash
docker logs ecs-vm-demo
docker logs cc-task-nginx
docker logs cc-task-tunnel
```

### Manual redeploy (without CI)

```bash
docker pull <ECR_IMAGE_URI>
docker stop ecs-vm-demo && docker rm ecs-vm-demo
docker run -d --name ecs-vm-demo --network cc-task-net --restart unless-stopped <ECR_IMAGE_URI>
```

### Re-register the GitHub Actions runner (if reinstalling the VM)

Run `setup-vm.yml` via `workflow_dispatch` first (installs Docker, AWS CLI, creates `cc-task-net`), then manually register the runner:

```bash
# Go to: GitHub repo → Settings → Actions → Runners → New self-hosted runner
# Follow the Linux instructions GitHub provides
sudo ./svc.sh install && sudo ./svc.sh start
```

---

## Pending / Known Issues

| Item | Detail |
|---|---|
| HTTPS cert warning on mobile | Self-signed cert causes one-time browser warning. Fix: set up Cloudflare Tunnel with a custom domain and add `CF_TUNNEL_TOKEN` secret — the tunnel step is already in the pipeline |
| `CF_TUNNEL_TOKEN` not set | The `Deploy Cloudflare Tunnel` step runs on every deploy but the tunnel won't connect without this secret. Add it in GitHub repo settings when ready |
| Node.js 20 action deprecation | GitHub Actions will force Node 24 from Sept 2026. Bump `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`, `actions/download-artifact` to versions that support Node 24 before then |
| Docker Hub pull timeouts | Transient network issue on GitHub-hosted runners pulling `node:20-alpine`. Re-trigger the failed workflow — it passes on retry. Long-term fix: mirror base images to ECR |

---

## Key Decisions

| Decision | Reason |
|---|---|
| `ssl_preread` stream block | Company firewall only forwards one port; this handles both HTTP and HTTPS clients without any firewall changes |
| Service worker killed | The original SW broke mobile browsers — `caches.addAll` is atomic so one failed fetch emptied the cache, and `Response.error()` on cache miss showed as a connection failure. Replaced with a self-unregistering kill-switch |
| `proxy_set_header Accept-Encoding ""` | Prevents Express + nginx double-gzip encoding. Upstream always sends uncompressed; nginx handles compression |
| OIDC auth (no static AWS keys) | IAM role assumed at runtime via GitHub OIDC — no long-lived credentials stored anywhere |
| `npm ci --omit=dev` in Docker | Keeps the production image lean. `prepare` script guards with `.git` existence check so Husky doesn't run inside Docker |
