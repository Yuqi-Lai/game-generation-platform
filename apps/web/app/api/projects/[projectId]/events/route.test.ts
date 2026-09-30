import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth0", () => ({ auth0: auth }));

import { GET } from "./route";

describe("project SSE proxy", () => {
  beforeEach(() => {
    auth.getSession.mockResolvedValue({ user: { sub: "user-1" } });
    auth.getAccessToken.mockResolvedValue({ token: "server-only-token" });
    vi.stubEnv("API_BASE_URL", "http://api.internal:8080");
    vi.stubEnv("AUTH0_AUDIENCE", "https://api.game-generation.local");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("authenticates upstream and streams SSE without exposing the token in the URL", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode("event:connected\ndata:{}\n\n"));
        controller.close();
      },
    }), { headers: { "Content-Type": "text/event-stream" } })));

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(fetch).toHaveBeenCalledWith(
      "http://api.internal:8080/api/v1/projects/project-1/events",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer server-only-token" }),
      }),
    );
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).not.toContain("server-only-token");
    expect(await response.text()).toContain("event:connected");
  });

  it("aborts and cancels the upstream stream when the browser disconnects", async () => {
    let upstreamCancelled = false;
    let upstreamSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((_url, init: RequestInit) => {
      upstreamSignal = init.signal as AbortSignal;
      return Promise.resolve(new Response(new ReadableStream({
        cancel() { upstreamCancelled = true; },
      }), { headers: { "Content-Type": "text/event-stream" } }));
    }));
    const browser = new AbortController();
    const response = await GET(new Request("http://localhost/api/projects/project-1/events", {
      signal: browser.signal,
    }), { params: Promise.resolve({ projectId: "project-1" }) });

    const reader = response.body!.getReader();
    browser.abort();
    await reader.cancel();

    expect(upstreamSignal?.aborted).toBe(true);
    expect(upstreamCancelled).toBe(true);
  });

  it("rejects an unauthenticated browser before opening an upstream stream", async () => {
    auth.getSession.mockResolvedValue(null);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  /*
    This route is the one exception to the `apiFetch` defence: it opens the
    upstream stream itself, so a public build would otherwise depend on an
    unset API_BASE_URL to stay closed.
  */
  it("does not exist in public portfolio mode", async () => {
    vi.stubEnv("PUBLIC_PORTFOLIO_MODE", "true");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(404);
    // Short-circuited before any session lookup or upstream connection.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  it("still serves the stream when portfolio mode is off", async () => {
    vi.stubEnv("PUBLIC_PORTFOLIO_MODE", "false");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.close(); },
    }), { headers: { "Content-Type": "text/event-stream" } })));

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });
    expect(response.status).toBe(200);
  });

  it("sends the headers that keep the stream unbuffered end to end", async () => {
    /*
      SSE through an intermediary is only useful unbuffered. Without these a
      reverse proxy is free to hold events back until the response completes,
      which for a long-lived stream means never.
    */
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.close(); },
    }), { headers: { "Content-Type": "text/event-stream" } })));

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.headers.get("Content-Type")).toBe("text/event-stream; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toBe("no-cache, no-transform");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });

  it("passes an upstream rejection through instead of masking it", async () => {
    // A 403 from the API is a real answer; reporting it as 200 or 502 would
    // send the browser into a reconnect loop against a door that is shut.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(403);
  });

  it("reports a bad gateway when the realtime service cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(502);
  });

  it("refuses to proxy when the API base URL is not configured", async () => {
    vi.stubEnv("API_BASE_URL", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const response = await GET(new Request("http://localhost/api/projects/project-1/events"), {
      params: Promise.resolve({ projectId: "project-1" }),
    });

    expect(response.status).toBe(503);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
