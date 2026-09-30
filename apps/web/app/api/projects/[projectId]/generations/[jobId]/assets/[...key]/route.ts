import { ApiError, apiFetch } from "@/lib/api";
import { objectKeyFrom, serveDeclaredAsset } from "@/lib/playable-assets";
import type { GenerationJob } from "@/lib/types";

/**
 * Serves one generated asset from the same origin as the page.
 *
 * Object storage is not reachable from the browser in any useful way: the
 * responses carry no CORS headers, so an image fetched straight from there is
 * tainted and cannot become a WebGL texture. The bytes come through here
 * instead. See `serveDeclaredAsset` for the allowlisting.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/generations/[jobId]/assets/[...key]">,
) {
  const { projectId, jobId, key } = await context.params;
  const objectKey = objectKeyFrom(key);
  if (!objectKey) return Response.json({ message: "Missing asset key." }, { status: 400 });

  let job: GenerationJob;
  try {
    job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(jobId)}`,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return Response.json({ message: "Asset is unavailable." }, { status: 502 });
  }

  if (!job.contentVersion) {
    return Response.json({ message: "Asset is unavailable." }, { status: 404 });
  }
  return serveDeclaredAsset(job.contentVersion.content, objectKey);
}
