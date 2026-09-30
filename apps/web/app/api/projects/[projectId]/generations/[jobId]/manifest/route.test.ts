import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  /* An explicit field, not a TS parameter property: inside `vi.hoisted` the
     parameter-property form does not get transformed and `status` never lands
     on the instance. */
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

const PROJECT = "project-1";
const JOB = "job-1";
const PREFIX = `/api/projects/${PROJECT}/generations/${JOB}/assets/`;

function job(content: unknown) {
  return { status: "SUCCEEDED", contentVersion: { content } };
}

function call() {
  return GET(new Request("http://localhost/whatever"), {
    params: Promise.resolve({ projectId: PROJECT, jobId: JOB }),
  });
}

/*
  There is deliberately no `beforeEach` resetting this mock. Both `mockReset`
  and `mockClear` make vitest surface the rejection recorded by the last test
  as an unhandled error and fail it, even though the route catches it and every
  assertion passes. Each test sets its own implementation, so the isolation
  that matters is already there.
*/
afterEach(() => vi.restoreAllMocks());

describe("generated manifest proxy", () => {
  /*
    The pipeline reports assets against the object storage endpoint. A browser
    can fetch those bytes but cannot make WebGL textures from them, because the
    responses carry no `Access-Control-Allow-Origin` — the images come back
    tainted and the world renders empty. This rewrite is what stops that.
  */
  it("repoints every asset at this origin and drops the storage base", async () => {
    api.apiFetch.mockResolvedValue(job({
      version: "playable-game-content/v1",
      assetBaseUrl: "http://localhost:4566/bucket/",
      assets: [
        { id: "a", objectKey: "projects/p/attempts/a/down.png" },
        { id: "b", objectKey: "projects/p/attempts/a/bg.png" },
      ],
    }));

    const body = await (await call()).json();

    /*
      Nulled rather than pointed at the proxy: the runtime resolves a non-null
      base with `new URL(key, base)`, which throws when the base is not
      absolute. Null takes the branch that returns the key untouched.
    */
    expect(body.assetBaseUrl).toBeNull();
    expect(body.assets.map((a: { url: string }) => a.url)).toEqual([
      `${PREFIX}projects/p/attempts/a/down.png`,
      `${PREFIX}projects/p/attempts/a/bg.png`,
    ]);
    // Nothing may still point at storage, or that asset silently stays broken.
    expect(JSON.stringify(body)).not.toContain("localhost:4566");
  });

  it("keeps the rest of the manifest untouched", async () => {
    const content = {
      version: "playable-game-content/v1",
      assetBaseUrl: "http://storage/bucket/",
      title: "Thaw at Saltfurrow",
      world: { width: 2560, height: 1440, tileSize: 64 },
      player: { assets: { frameWidth: 128, frameHeight: 128, frameCount: 3 } },
      scenes: [{ backgroundAssetId: "b" }],
      assets: [],
    };
    api.apiFetch.mockResolvedValue(job(content));

    const body = await (await call()).json();

    expect(body.version).toBe("playable-game-content/v1");
    expect(body.world).toEqual(content.world);
    expect(body.player).toEqual(content.player);
    expect(body.scenes).toEqual(content.scenes);
    expect(body.title).toBe(content.title);
  });

  it("leaves an asset that already carries an absolute url alone", async () => {
    api.apiFetch.mockResolvedValue(job({
      version: "playable-game-content/v1",
      assetBaseUrl: "http://localhost:4566/bucket/",
      assets: [{ id: "a", objectKey: "k.png", url: "https://cdn.example/k.png" }],
    }));

    const body = await (await call()).json();
    expect(body.assets[0].url).toBe("https://cdn.example/k.png");
  });

  it("still refuses a job that is not a playable v1 result", async () => {
    api.apiFetch.mockResolvedValue(job({ version: "legacy-game/v0", assets: [] }));
    expect((await call()).status).toBe(422);
  });

  it("still refuses a job that has not succeeded", async () => {
    api.apiFetch.mockResolvedValue({ status: "RUNNING", contentVersion: null });
    expect((await call()).status).toBe(409);
  });

  it("propagates an API rejection rather than masking it", async () => {
    api.apiFetch.mockImplementation(async () => {
      throw new api.ApiError("Nope", 403);
    });

    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: "Nope" });
  });
});
