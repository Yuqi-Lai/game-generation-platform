import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * `lib/auth0.ts` decides between the real client and the mock at module load,
 * so every case here re-imports it under different environment variables.
 */
const SECRET = "local-mock-auth-secret-32-chars-min";
const ISSUER = "https://mock-auth.local/";
const AUDIENCE = "https://api.game-generation.local";

async function loadAuth(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return import("./auth0");
}

function decodeSegment(segment: string) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("local mock auth", () => {
  it("stays off unless MOCK_AUTH is exactly true", async () => {
    for (const value of [undefined, "false", "1", "TRUE"]) {
      const { isMockAuth } = await loadAuth({ MOCK_AUTH: value });
      expect(isMockAuth, `MOCK_AUTH=${String(value)}`).toBe(false);
      vi.unstubAllEnvs();
    }
  });

  it("turns on with MOCK_AUTH=true outside production", async () => {
    const { isMockAuth } = await loadAuth({ MOCK_AUTH: "true" });
    expect(isMockAuth).toBe(true);
  });

  /*
    A mock auth bypass reaching production would be a critical hole, so the flag
    is refused there regardless of how it got set.
  */
  it("refuses to activate in a production build", async () => {
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const { isMockAuth } = await loadAuth({ MOCK_AUTH: "true", NODE_ENV: "production" });

    expect(isMockAuth).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("ignored in a production build"));
  });

  it("hands back a signed-in session so the route guard passes", async () => {
    const { auth0 } = await loadAuth({
      MOCK_AUTH: "true",
      MOCK_AUTH_EMAIL: "dev@local.test",
      MOCK_AUTH_NAME: "Local Developer",
    });

    const session = await auth0.getSession();
    // `app/(app)/layout.tsx` redirects on a falsy session and prints user.name.
    expect(session).toBeTruthy();
    expect(session!.user.email).toBe("dev@local.test");
    expect(session!.user.name).toBe("Local Developer");
    expect(session!.user.sub).toBe("mock|local-dev");
  });

  it("mints a token the API's HS256 decoder will verify", async () => {
    const { auth0 } = await loadAuth({
      MOCK_AUTH: "true",
      MOCK_AUTH_SECRET: SECRET,
      MOCK_AUTH_ISSUER: ISSUER,
      AUTH0_AUDIENCE: AUDIENCE,
      MOCK_AUTH_EMAIL: "dev@local.test",
    });

    const { token } = await auth0.getAccessToken();
    const [header, payload, signature] = token.split(".");
    expect(signature).toBeTruthy();

    expect(decodeSegment(header)).toEqual({ alg: "HS256", typ: "JWT" });

    // SecurityConfig validates iss and aud; AuthenticatedUserService needs sub
    // plus a verified email on first access.
    const claims = decodeSegment(payload);
    expect(claims.iss).toBe(ISSUER);
    expect(claims.aud).toEqual([AUDIENCE]);
    expect(claims.sub).toBe("mock|local-dev");
    expect(claims.email).toBe("dev@local.test");
    expect(claims.email_verified).toBe(true);
    expect(claims.exp).toBeGreaterThan(claims.iat);

    // The signature must actually verify against the shared secret.
    const expected = createHmac("sha256", SECRET)
      .update(`${header}.${payload}`)
      .digest("base64url");
    expect(signature).toBe(expected);
  });

  it("rejects a secret the API would reject", async () => {
    const { auth0 } = await loadAuth({ MOCK_AUTH: "true", MOCK_AUTH_SECRET: "too-short" });
    // NimbusJwtDecoder.withSecretKey requires at least 32 characters.
    await expect(auth0.getAccessToken()).rejects.toThrow(/at least 32 characters/);
  });

  it("passes requests through instead of calling Auth0", async () => {
    const { auth0 } = await loadAuth({ MOCK_AUTH: "true" });
    const response = await auth0.middleware(new Request("http://localhost:3000/projects"));
    expect(response.status).toBe(200);
  });

  it("throws a useful error for anything it does not implement", async () => {
    const { auth0 } = await loadAuth({ MOCK_AUTH: "true" });
    expect(() => (auth0 as unknown as Record<string, unknown>).getUser).toThrow(
      /not implemented by the MOCK_AUTH client/,
    );
  });
});

describe("public portfolio auth isolation", () => {
  it("requires no Auth0 configuration and never returns a session or token", async () => {
    const { auth0, isMockAuth } = await loadAuth({
      PUBLIC_PORTFOLIO_MODE: "true",
      MOCK_AUTH: undefined,
      AUTH0_DOMAIN: undefined,
      AUTH0_CLIENT_ID: undefined,
      AUTH0_CLIENT_SECRET: undefined,
      AUTH0_SECRET: undefined,
    });

    expect(isMockAuth).toBe(false);
    await expect(auth0.getSession()).resolves.toBeNull();
    await expect(auth0.getAccessToken()).rejects.toThrow(/unavailable in public portfolio mode/);
  });
});
