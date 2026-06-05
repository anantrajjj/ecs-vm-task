# Brick Breaker

A production-quality Brick Breaker / Breakout game served by an Express backend, deployed to AWS ECS and an office VM via GitHub Actions.

## Local Development

```bash
npm install
npm start          # http://localhost:3000
npm test           # validates server loads correctly
```

## Controls

| Input | Action |
|---|---|
| Mouse move | Move paddle |
| Touch drag | Move paddle |
| ← → arrow keys | Move paddle |
| Space | Launch ball / pause / resume / advance level |
| Click / Tap | Launch ball / advance level |

## Game Features

- 8 levels with escalating difficulty
- 4 power-ups: Wide Paddle, Multi-Ball, Slow Ball, Laser
- Multi-hit and indestructible bricks
- Combo multiplier (rapid successive hits)
- Ball speed carries across levels
- High score persisted via localStorage
- Web Audio API sound effects
- Effect timer bars on paddle with expiry warning

## API Endpoints

| Route | Response |
|---|---|
| `GET /health` | `{"status":"healthy"}` |
| `GET /version` | `{"version":"…","name":"…","node_env":"…"}` |
| `GET /metrics` | Uptime, request count, memory, load avg |
| `GET /ready` | Readiness probe |

`/metrics` is protected by `METRICS_TOKEN` env var when set (`Authorization: Bearer <token>`).

## Architecture

```
Express (index.js)
├── express.static → public/          # game HTML + JS
├── GET /health, /version, /metrics   # API
└── fallback → public/index.html      # SPA-style catch-all

public/
├── index.html    # shell: HUD, overlays, canvas
└── game.js       # full game: entities, physics, renderer, input, audio
```

No build step required — the game is vanilla HTML5 Canvas + browser ES5 JavaScript. The Dockerfile copies the repo as-is and runs `node index.js`.

## Docker

```bash
docker build -t brick-breaker .
docker run --rm -p 3000:3000 brick-breaker
```

## Deployment

Pushes to `main` trigger the GitHub Actions pipeline (`.github/workflows/deploy.yml`):

1. **Build & Scan** — `npm ci`, `npm test`, Docker build, Trivy vulnerability scan
2. **Push to ECR** — tags and pushes image to Amazon ECR
3. **Deploy to ECS** — updates task definition, deploys to ECS service
4. **Deploy to Office VM** — self-hosted runner pulls image, restarts container on port 3000

### Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `AWS_ROLE_ARN` | IAM role for OIDC auth |
| `AWS_REGION` | Target AWS region |
| `ECR_REPOSITORY` | ECR repo name |
| `ECS_CLUSTER` | ECS cluster name |
| `ECS_SERVICE` | ECS service name |
| `ECS_TASK_DEFINITION` | Task definition family name |
| `ECS_CONTAINER_NAME` | Container name in task def |
| `METRICS_TOKEN` | Optional bearer token for `/metrics` |

### Render (optional)

`render.yaml` is included for one-click deploy on Render.com. Connect the GitHub repo, Render detects the config automatically.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `APP_NAME` | `ecs-vm-demo` | App identifier in logs |
| `NODE_ENV` | `production` | Node environment |
| `METRICS_TOKEN` | _(unset)_ | Protects `/metrics` when set |
