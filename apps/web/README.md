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
