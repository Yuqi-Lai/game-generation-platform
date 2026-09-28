import { ApiError, apiFetch } from "@/lib/api";
import type { GenerationJob } from "@/lib/types";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/generations/[jobId]">,
) {
  const { projectId, jobId } = await context.params;
  try {
    const job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/generations/${encodeURIComponent(jobId)}`,
    );
    return Response.json(job, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return Response.json({ message: "Generation status is unavailable." }, { status: 502 });
  }
}
