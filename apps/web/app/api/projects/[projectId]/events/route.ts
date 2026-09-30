import { auth0 } from "@/lib/auth0";
import { isPublicPortfolioMode } from "@/lib/deployment-mode";

export async function GET(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]/events">,
) {
  /*
    Every other route under /api/projects reaches the platform API through
    `apiFetch`, which refuses outright in public portfolio mode. This one opens
    the upstream stream itself, so that guard never sees it — without this the
    route's safety in a public build rests on environment variables (an unset
    API_BASE_URL, a session-less Auth0 stand-in) rather than on code.

    404 rather than 403: in a portfolio build this endpoint does not exist.
  */
  if (isPublicPortfolioMode()) return new Response(null, { status: 404 });

  const session = await auth0.getSession();
  if (!session) return new Response(null, { status: 401 });

  const baseUrl = process.env.API_BASE_URL;
  if (!baseUrl) return new Response("API_BASE_URL is not configured", { status: 503 });

  const audience = process.env.AUTH0_AUDIENCE;
  const accessToken = await auth0.getAccessToken(audience ? { audience } : undefined);
  const { projectId } = await context.params;
  const upstreamAbort = new AbortController();
  const abortUpstream = () => upstreamAbort.abort();
  request.signal.addEventListener("abort", abortUpstream, { once: true });

  let upstream: Response;
  try {
    upstream = await fetch(
      `${baseUrl.replace(/\/$/, "")}/api/v1/projects/${encodeURIComponent(projectId)}/events`,
      {
        cache: "no-store",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${accessToken.token}`,
        },
        signal: upstreamAbort.signal,
      },
    );
  } catch {
    request.signal.removeEventListener("abort", abortUpstream);
    if (upstreamAbort.signal.aborted) return new Response(null, { status: 499 });
    return new Response("Realtime service is unavailable", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    request.signal.removeEventListener("abort", abortUpstream);
    return new Response(null, { status: upstream.ok ? 502 : upstream.status });
  }

  const reader = upstream.body.getReader();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          request.signal.removeEventListener("abort", abortUpstream);
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        request.signal.removeEventListener("abort", abortUpstream);
        if (upstreamAbort.signal.aborted) controller.close();
        else controller.error(error);
      }
    },
    async cancel(reason) {
      request.signal.removeEventListener("abort", abortUpstream);
      upstreamAbort.abort();
      await reader.cancel(reason).catch(() => undefined);
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    },
  });
}
