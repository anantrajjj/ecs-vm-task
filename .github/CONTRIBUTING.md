# Contributing

## Workflow

1. Branch off `main` — use `feat/`, `fix/`, or `chore/` prefixes
2. Make your changes
3. Open a pull request against `main`
4. The CI pipeline must pass before merge

## CI Pipeline

Every push runs the following gates automatically:

- **Validate** — checks server exports load correctly
- **Lint** — ESLint with env-aware globals
- **Format** — Prettier (run `npm run format` locally before pushing)
- **Audit** — `npm audit --audit-level=high`
- **Docker build** — image must build cleanly
- **Trivy scan** — no CRITICAL CVEs allowed

## Local Setup

```bash
npm install   # installs deps + sets up pre-commit hooks via Husky
npm start     # runs Express locally
npm test      # validate + lint + format check
```

The pre-commit hook runs ESLint and Prettier on staged files automatically.
If you need to skip it in an emergency: `git commit --no-verify` (use sparingly).

## Constraints

- Do not modify `Dockerfile` or `docker-compose.yml` without discussion
- `/health`, `/ready`, `/version`, and `/metrics` endpoints must remain functional
- Keep devDependencies out of `dependencies` — the Docker image installs only production deps

## Commit Style

```
type: short description

feat:   new feature
fix:    bug fix
chore:  tooling, deps, config
docs:   documentation only
```
