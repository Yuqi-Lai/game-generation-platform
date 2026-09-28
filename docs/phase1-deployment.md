# Phase 1 deployment

Phase 1 uses Vercel for the Next.js application and Render for the Spring Boot API and managed PostgreSQL. The deployment contains no generation worker, Kafka, Redis, S3, SSE, or other Phase 2 infrastructure.

## Auth0 tenant

Create separate development and production Auth0 tenants. In each tenant:

1. Create an Auth0 API whose identifier is the value of `AUTH0_AUDIENCE`.
2. Create a Regular Web Application for the Next.js service.
3. Enable the GitHub social connection for that application.
4. Add the relevant `/auth/callback` URL, logout URL, and web origin.
5. Keep public signup disabled operationally. Admission is also enforced by the API: a first-time principal must present a verified email matching a pending invitation.

Auth0 authenticates the principal. The API identifies that principal only by the pair `(issuer, subject)`; email is profile and admission data, not an identity key.

For the initial deployment, set `BOOTSTRAP_INVITED_EMAILS` to a comma-separated allowlist. The API creates pending invitations idempotently on startup. Later administration can replace this bootstrap mechanism without changing identity semantics.

## Render API and PostgreSQL

Create a Blueprint from the repository root `render.yaml`. It provisions:

- a free, sleep-capable API web service;
- the smallest persistent Render PostgreSQL plan in the Ohio region;
- a private-only database connection;
- `/actuator/health/readiness` as the API health check.

Render prompts for the `sync: false` values. Configure:

- `AUTH0_ISSUER_URI` with the trailing slash;
- `AUTH0_JWK_SET_URI` for the same tenant;
- `AUTH0_AUDIENCE` with the API identifier;
- `BOOTSTRAP_INVITED_EMAILS` with the initial allowlist;
- `CORS_ALLOWED_ORIGINS` with the production Vercel origin.

The Blueprint injects Render's private PostgreSQL connection string. The API converts that URI to JDBC properties before Spring creates the datasource. Flyway applies schema migrations at startup.

## Vercel web application

Import the repository as a Vercel project and set its Root Directory to `apps/web`. Configure these environment variables for Production and the desired Preview environments:

- `API_BASE_URL`: public HTTPS URL of the Render API;
- `APP_BASE_URL`: stable production web origin (omit for dynamic preview hosts if those hosts are allowlisted in Auth0);
- `AUTH0_DOMAIN`;
- `AUTH0_CLIENT_ID`;
- `AUTH0_CLIENT_SECRET`;
- `AUTH0_SECRET`: a 32-byte hex session secret;
- `AUTH0_AUDIENCE`.

Register `https://<production-host>/auth/callback` as an allowed callback, the production origin as an allowed logout URL and web origin, and repeat that process for any preview host allowed to authenticate.

Vercel and Render deploy from Git after their projects are connected. GitHub Actions remains the merge gate; it does not store deployment credentials.
