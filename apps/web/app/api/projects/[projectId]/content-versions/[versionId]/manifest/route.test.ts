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

import { GET as manifest } from "./route";
import { GET as asset } from "../assets/[...key]/route";

const KEY = "projects/p/attempts/a/player/down.png";
const PREFIX = "/api/projects/p/content-versions/v/assets/";

/*
  No `beforeEach` resetting the mock: resetting or clearing it makes vitest
  report the rejection recorded by the failure tests as an unhandled error.
  Every test sets its own implementation.
*/
afterEach(() => vi.unstubAllGlobals());

function version(content: unknown) {
  return { id: "v", versionNumber: 1, status: "DRAFT", title: "T", assets: [], content };
}

const params = { projectId: "p", versionId: "v" };

describe("version-addressed playable manifest", () => {
  /*
    This route exists because a generation job id lives only in the URL the
    generate flow redirects to, and the platform API cannot list a project's
    jobs. Versions are listed on the project page forever, so this is the only
    durable way back into a generated world.
  */
  it("repoints assets at the version-addressed asset route", async () => {
    api.apiFetch.mockResolvedValue(version({
      version: "playable-game-content/v1",
      assetBaseUrl: "http://localhost:4566/bucket/",
      assets: [{ id: "a", objectKey: KEY }],
    }));

    const body = await (await manifest(new Request("http://localhost/x"), {
      params: Promise.resolve(params),
    })).json();

    expect(body.assetBaseUrl).toBeNull();
    expect(body.assets[0].url).toBe(`${PREFIX}${KEY}`);
    expect(JSON.stringify(body)).not.toContain("localhost:4566");
    // Fetched by version, not by job.
    expect(api.apiFetch).toHaveBeenCalledWith("/api/v1/projects/p/content-versions/v");
  });

  it("refuses a version that is not a playable v1 result", async () => {
    api.apiFetch.mockResolvedValue(version({ version: "legacy-game/v0", assets: [] }));
    const response = await manifest(new Request("http://localhost/x"), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(422);
  });

  it("propagates an API rejection rather than masking it", async () => {
    api.apiFetch.mockImplementation(async () => {
      throw new api.ApiError("Forbidden", 403);
    });
    const response = await manifest(new Request("http://localhost/x"), {
      params: Promise.resolve(params),
    });
    expect(response.status).toBe(403);
  });
});

describe("version-addressed asset proxy", () => {
  it("streams a declared asset from this origin", async () => {
    api.apiFetch.mockResolvedValue(version({
      assetBaseUrl: "http://storage/bucket/",
      assets: [{ objectKey: KEY, contentType: "image/png" }],
    }));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(png)));

    const response = await asset(new Request("http://localhost/x"), {
      params: Promise.resolve({ ...params, key: KEY.split("/") }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(png);
  });

  /* The guard that keeps this from being an open proxy into the bucket. */
  it("refuses a key the version's own manifest does not declare", async () => {
    api.apiFetch.mockResolvedValue(version({
      assetBaseUrl: "http://storage/bucket/",
      assets: [{ objectKey: KEY }],
    }));
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await asset(new Request("http://localhost/x"), {
      params: Promise.resolve({ ...params, key: ["projects", "other", "secret.png"] }),
    });

    expect(response.status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
