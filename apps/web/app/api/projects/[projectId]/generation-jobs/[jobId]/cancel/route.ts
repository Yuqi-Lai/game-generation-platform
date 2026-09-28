import { ApiError, apiFetch } from "@/lib/api";
import type { GenerationJob } from "@/lib/types";

export async function POST(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/generation-jobs/[jobId]/cancel">,
) {
  const { projectId, jobId } = await context.params;
  try {
    const job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/generation-jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST" },
    );
    return Response.json(job);
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ message: error.message }, { status: error.status });
    return Response.json({ message: "Could not cancel generation." }, { status: 502 });
  }
}
