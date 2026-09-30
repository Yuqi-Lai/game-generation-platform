# Forge web application

The Phase 1 web application is a Next.js App Router service. Auth0 owns the browser session; server components and server actions exchange its access token for project data from the Java API. Access tokens are never exposed to client components.

## Local configuration

Copy the values documented in the repository `.env.example` into `apps/web/.env.local`. Configure the Auth0 application as a Regular Web Application with:

- callback URL: `http://localhost:3000/auth/callback`
- logout URL: `http://localhost:3000`
- web origin: `http://localhost:3000`
- API audience matching `AUTH0_AUDIENCE`
- GitHub enabled as a social connection

Run `npm run dev`, or use the repository Docker Compose environment.

## Checks

```bash
npm run lint
npm test
npm run build
```

## Local development without an Auth0 tenant

`MOCK_AUTH=true` replaces the Auth0 client with a local stand-in, so the
workspace and the generation flow work without credentials. It injects a fixed
signed-in session *and* mints an HS256 access token the platform API accepts —
a session alone gets you past the route guard, but every `apiFetch` would still
return 401.

It is already enabled in `.env.local`. The API needs the matching overlay:

```sh
docker compose -p forge \
  -f infra/local/compose.yaml \
  -f infra/local/compose.mock-auth.yaml \
  up -d api
```

That flips `app.load-test.auth-enabled`, which `SecurityConfig` already
supports: the JWT decoder verifies HS256 against a shared secret instead of
fetching Auth0's JWKS. Three values must agree between `.env.local` and the
overlay — the secret, the issuer, and the mock email, which has to appear in
`BOOTSTRAP_INVITED_EMAILS` because first access requires a pending invitation.

Back to real Auth0:

```sh
docker compose -p forge -f infra/local/compose.yaml up -d api
```

Then unset `MOCK_AUTH` and supply real `AUTH0_*` values.

## Public portfolio deployment

Set only `PUBLIC_PORTFOLIO_MODE=true` for the zero-backend portfolio build. In
that mode the landing page replays the checked-in `/public/demo` bundle,
private workspace routes redirect home, and server-side generation is refused.
Do not configure Auth0, API, database, Kafka, Redis, object-storage, or provider
credentials for this deployment.

`MOCK_AUTH` is ignored in a production build and logs an error if set, so the
bypass cannot ship. `/auth/login` and `/auth/logout` are not served while it is
active — the mock session simply always exists.
