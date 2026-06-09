# Security Policy

## Reporting a Vulnerability

Do not open a public GitHub issue for security vulnerabilities.

Report them privately by emailing the maintainer directly. Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any suggested mitigations if known

You will receive a response within 5 business days. If the vulnerability is confirmed,
a fix will be prioritised and you will be credited in the release notes unless you prefer otherwise.

## Scope

| In scope |
|---|
| Express API endpoints (`/health`, `/metrics`, `/version`, `/ready`) |
| nginx configuration (information disclosure, bypass) |
| Docker image vulnerabilities |
| CI/CD pipeline (secret exposure, supply chain) |

## Security Measures in Place

- Dependencies scanned on every push with `npm audit --audit-level=high`
- Docker images scanned with Trivy (CRITICAL CVEs block deployment)
- AWS access via OIDC — no long-lived IAM keys in CI
- `/metrics` endpoint protected by bearer token when `METRICS_TOKEN` is set
- CSP, `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` headers on all responses
