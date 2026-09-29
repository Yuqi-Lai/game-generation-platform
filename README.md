# Game Generation Platform

## Playable example

[Tideglass Farm](examples/tideglass-farm/README.md) is an original seaside-farm canary premise for the JRPG pixel-art generator. It shows a compact cottage, crop beds, and a nearby shore without using the preserved legacy sample stories. The V1 runtime supports exploration and dialogue; farming interactions are not implemented yet.

This repository contains the Phase 1 foundation for a game content generation and production platform. The current live workflow is an invite-only project workspace; generation and versioning begin in Phase 2.

## Repository layout

- `apps/web` — Next.js 16, React, TypeScript, Auth0 browser session, and project UI.
- `services/api` — Java 21 Spring Boot resource server, project authorization, PostgreSQL, and Flyway.
- `infra/local` — Docker Compose development environment.
- `legacy/playrpg` — preserved Phase 0 prototype and playable demo. It is reference-only and excluded from deployment contexts.
- `tests/test_legacy_smoke.py` — the single relocation smoke test for the preserved demo.

PostgreSQL is the source of truth. The backend service layer enforces every project permission using the roles `OWNER`, `EDITOR`, `REVIEWER`, and `VIEWER`. Auth0 issuer and subject form the external identity key; email is intentionally non-unique.

## Local development

Copy `.env.example` to `.env`, then fill in a development Auth0 tenant configured for GitHub login. Start the stack from the repository root:

```bash
docker compose -f infra/local/compose.yaml up --build
```

The web app runs at `http://localhost:3000`, the API at `http://localhost:8080`, and PostgreSQL at `localhost:5432`. Readiness is available at `http://localhost:8080/actuator/health/readiness`.

The placeholder Auth0 values allow the containers to start but cannot authenticate a user. Interactive development requires real development-tenant values in the ignored `.env` file.

## Verification

```bash
cd services/api && ./mvnw verify
cd apps/web && npm ci && npm run lint && npm test && npm run build
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest tests.test_legacy_smoke
python3 scripts/security_scan.py
```

The API integration test uses Testcontainers and requires Docker.

## Deployment

The web application deploys to Vercel with `apps/web` as its Root Directory. The root `render.yaml` provisions the API and managed PostgreSQL on Render. See [Phase 1 deployment](docs/phase1-deployment.md) for Auth0 and environment setup.

No Phase 2 event or generation infrastructure is included in this phase.
