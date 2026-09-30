import { ApiError, apiFetch } from "@/lib/api";
import { PLAYABLE_VERSION, sameOriginAssets } from "@/lib/playable-assets";
import type { GenerationJob } from "@/lib/types";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/generations/[jobId]/manifest">,
) {
  const { projectId, jobId } = await context.params;
  try {
    const job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(jobId)}`,
    );
    if (job.status !== "SUCCEEDED" || !job.contentVersion) {
      return Response.json({ message: "Playable content is not ready." }, { status: 409 });
    }
    if (job.contentVersion.content.version !== PLAYABLE_VERSION) {
      return Response.json({ message: "This version is not a playable V1 result." }, { status: 422 });
    }
    const prefix =
      `/api/projects/${encodeURIComponent(projectId)}` +
      `/generations/${encodeURIComponent(jobId)}/assets/`;
    return Response.json(sameOriginAssets(job.contentVersion.content, prefix), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return Response.json({ message: "Playable manifest is unavailable." }, { status: 502 });
  }
}
