import { ApiError, apiFetch } from "@/lib/api";
import type { GenerationJob } from "@/lib/types";

export async function POST(
  request: Request,
  context: RouteContext<"/api/projects/[projectId]/generation-jobs/[jobId]/retry">,
) {
  const { projectId, jobId } = await context.params;
  const body = await request.json() as { requestId?: string };
  try {
    const job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/generation-jobs/${encodeURIComponent(jobId)}/retry`,
      { method: "POST", body: JSON.stringify({ requestId: body.requestId }) },
    );
    return Response.json(job);
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ message: error.message }, { status: error.status });
    return Response.json({ message: "Could not retry generation." }, { status: 502 });
  }
}
