import { Auth0Client } from "@auth0/nextjs-auth0/server";
import { NextResponse } from "next/server";
import { isPublicPortfolioMode } from "./deployment-mode";

const audience = process.env.AUTH0_AUDIENCE;

/* ========================================================================== */
/* Local mock auth                                                            */
/* ========================================================================== */

/**
 * `MOCK_AUTH=true` replaces the Auth0 client with a local stand-in, so the
 * workspace is usable without an Auth0 tenant.
 *
 * It does two things: hands back a fixed signed-in session, and mints an HS256
 * access token the platform API will accept. That second half matters — a
 * session alone gets you past the route guard but every `apiFetch` still 401s.
 *
 * The API already supports this: `SecurityConfig.jwtDecoder` swaps to
 * `NimbusJwtDecoder.withSecretKey(...)` when `app.load-test.auth-enabled` is
 * set, instead of fetching Auth0's JWKS. It still validates `iss` and `aud`, so
 * the claims below must match the API's `AUTH0_ISSUER_URI` and `AUTH0_AUDIENCE`.
 * The token shape mirrors `tests/load/run-credits-concurrency.sh`, which is the
 * existing precedent for this in the repo.
 *
 * Never active in a production build — see `mockEnabled`.
 */
const MOCK_ISSUER = process.env.MOCK_AUTH_ISSUER ?? "https://mock-auth.local/";
const MOCK_AUDIENCE = audience ?? "https://api.game-generation.local";
/** Must match the API's `LOAD_TEST_AUTH_SECRET`. 32 chars is the API's minimum. */
const MOCK_SECRET = process.env.MOCK_AUTH_SECRET ?? "local-mock-auth-secret-32-chars-min";
const MOCK_USER = {
  sub: process.env.MOCK_AUTH_SUB ?? "mock|local-dev",
  email: process.env.MOCK_AUTH_EMAIL ?? "dev@local.test",
  name: process.env.MOCK_AUTH_NAME ?? "Local Developer",
  email_verified: true,
};

function mockEnabled() {
  if (process.env.MOCK_AUTH !== "true") return false;
  if (process.env.NODE_ENV === "production") {
    // Refuse rather than ship an auth bypass. Real Auth0 is used instead.
    console.error(
      "[auth] MOCK_AUTH=true is ignored in a production build. Real Auth0 is being used.",
    );
    return false;
  }
  return true;
}

const textEncoder = new TextEncoder();

function base64url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const encodeSegment = (value: unknown) => base64url(textEncoder.encode(JSON.stringify(value)));

/**
 * Mints an HS256 JWT with the claims `AuthenticatedUserService.resolve` needs:
 * `iss`, `sub`, and — for a first-time user — a verified `email` that matches a
 * pending invitation.
 *
 * Uses Web Crypto rather than `node:crypto` so this module stays importable
 * from middleware, which does not run on the Node runtime.
 */
async function mintMockAccessToken() {
  if (MOCK_SECRET.length < 32) {
    throw new Error(
      "MOCK_AUTH_SECRET must be at least 32 characters — the API rejects shorter secrets.",
    );
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const unsigned = [
    encodeSegment({ alg: "HS256", typ: "JWT" }),
    encodeSegment({
      iss: MOCK_ISSUER,
      sub: MOCK_USER.sub,
      aud: [MOCK_AUDIENCE],
      iat: issuedAt,
      exp: issuedAt + 3600,
      email: MOCK_USER.email,
      email_verified: true,
      name: MOCK_USER.name,
    }),
  ].join(".");

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(MOCK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(unsigned));
  return `${unsigned}.${base64url(new Uint8Array(signature))}`;
}

/** Only the three members the app actually uses; anything else throws loudly. */
function createMockClient() {
  const implemented = {
    getSession: async () => ({ user: MOCK_USER }),
    getAccessToken: async () => ({ token: await mintMockAccessToken(), expiresAt: 0 }),
    // No Auth0 round trip, so nothing to intercept.
    middleware: async () => NextResponse.next(),
  };

  return new Proxy(implemented, {
    get(target, property, receiver) {
      if (property in target || typeof property === "symbol") {
        return Reflect.get(target, property, receiver);
      }
      throw new Error(
        `[auth] auth0.${String(property)} is not implemented by the MOCK_AUTH client. ` +
          "Add it to createMockClient in lib/auth0.ts, or run against a real Auth0 tenant.",
      );
    },
  });
}

/**
 * Public portfolio builds have no private workspace and intentionally carry no
 * Auth0 credentials. Next still evaluates protected route modules while it
 * builds the route graph, so provide a no-network client instead of
 * constructing (and warning from) an unconfigured Auth0 SDK instance.
 */
function createPublicPortfolioClient() {
  const implemented = {
    getSession: async () => null,
    getAccessToken: async () => {
      throw new Error("Auth0 access tokens are unavailable in public portfolio mode.");
    },
    middleware: async () => NextResponse.next(),
  };

  return new Proxy(implemented, {
    get(target, property, receiver) {
      if (property in target || typeof property === "symbol") {
        return Reflect.get(target, property, receiver);
      }
      throw new Error(
        `[auth] auth0.${String(property)} is unavailable in public portfolio mode.`,
      );
    },
  });
}

/* ========================================================================== */

/**
 * Exactly one client is constructed. That is the point: building the real
 * `Auth0Client` without credentials is what logs the missing-options warning
 * and makes `/auth/login` fail its OIDC discovery with a 500.
 */
export const auth0 = isPublicPortfolioMode()
  ? (createPublicPortfolioClient() as unknown as Auth0Client)
  : mockEnabled()
    ? // The mock covers the used surface; the Proxy above rejects the rest.
      (createMockClient() as unknown as Auth0Client)
    : new Auth0Client({
        authorizationParameters: {
          scope: "openid profile email",
          ...(audience ? { audience } : {}),
        },
        signInReturnToPath: "/projects",
      });

/** True when the local mock is standing in for Auth0. For dev-only UI hints. */
export const isMockAuth = !isPublicPortfolioMode() && mockEnabled();
