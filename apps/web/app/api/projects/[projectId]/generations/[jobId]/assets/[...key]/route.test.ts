import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  /* An explicit field, not a TS parameter property: inside `vi.hoisted` the
     parameter-property form is not transformed and `status` never lands on the
     instance. */
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError, apiFetch: vi.fn() };
});

vi.mock("@/lib/api", () => ({ ApiError: api.ApiError, apiFetch: api.apiFetch }));

import { GET } from "./route";

const KEY = "projects/p/generation-jobs/j/attempts/a/down.png";

/*
  No `beforeEach` resetting the mock: resetting or clearing it makes vitest
  report the rejection recorded by the failure tests as an unhandled error.
  Every test sets its own implementation.
*/
afterEach(() => vi.unstubAllGlobals());

function job(assets: unknown[], assetBaseUrl: string | null = "http://storage/bucket/") {
  return {
    status: "SUCCEEDED",
    contentVersion: { content: { version: "playable-game-content/v1", assetBaseUrl, assets } },
  };
}

function call(key = KEY) {
  return GET(new Request("http://localhost/whatever"), {
    params: Promise.resolve({ projectId: "p", jobId: "j", key: key.split("/") }),
  });
}

describe("generated asset proxy", () => {
  it("streams a declared asset back from this origin", async () => {
    api.apiFetch.mockResolvedValue(job([{ objectKey: KEY, contentType: "image/png" }]));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(png, { headers: { "Content-Type": "image/png" } }),
    ));

    const response = await call();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    // Behind the caller's session, so never a shared cache.
    expect(response.headers.get("Cache-Control")).toMatch(/private/);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
    // Fetched from storage server-side, so the browser never sees that host.
    expect(fetch).toHaveBeenCalledWith(
      new URL(`http://storage/bucket/${KEY}`),
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  /*
    The guard that keeps this from being an open proxy into the bucket. Without
    it, any key could be read through an authenticated session.
  */
  it("refuses a key the job's own manifest does not declare", async () => {
    api.apiFetch.mockResolvedValue(job([{ objectKey: "projects/p/attempts/a/allowed.png" }]));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await call("projects/other/secret.png");

    expect(response.status).toBe(404);
    // And it must not have gone anywhere near storage.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("propagates an API rejection rather than masking it", async () => {
    api.apiFetch.mockImplementation(async () => {
      throw new api.ApiError("Forbidden", 403);
    });
    expect((await call()).status).toBe(403);
  });

  it("reports a bad gateway when storage cannot be reached", async () => {
    api.apiFetch.mockResolvedValue(job([{ objectKey: KEY }]));
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
      throw new Error("ECONNREFUSED");
    }));
    expect((await call()).status).toBe(502);
  });

  it("passes a storage miss through with its own status", async () => {
    api.apiFetch.mockResolvedValue(job([{ objectKey: KEY }]));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect((await call()).status).toBe(404);
  });

  it("reports when the manifest names no storage base at all", async () => {
    api.apiFetch.mockResolvedValue(job([{ objectKey: KEY }], null));
    expect((await call()).status).toBe(503);
  });
});
