import { ApiError, apiFetch } from "@/lib/api";
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
    if (job.contentVersion.content.version !== "playable-game-content/v1") {
      return Response.json({ message: "This version is not a playable V1 result." }, { status: 422 });
    }
    return Response.json(job.contentVersion.content, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return Response.json({ message: "Playable manifest is unavailable." }, { status: 502 });
  }
}
