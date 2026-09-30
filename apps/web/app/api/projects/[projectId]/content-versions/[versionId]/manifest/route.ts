import { ApiError, apiFetch } from "@/lib/api";
import { PLAYABLE_VERSION, sameOriginAssets } from "@/lib/playable-assets";
import type { ContentVersion } from "@/lib/types";

/**
 * The same playable manifest, addressed by content version instead of by job.
 *
 * A generation job id only exists in the URL the generate flow redirects to.
 * Lose that URL and the job is unreachable — the platform API exposes no way to
 * list a project's jobs. Content versions, on the other hand, are listed on the
 * project page forever, so addressing the manifest this way is what makes a
 * generated world playable again after leaving the page.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/content-versions/[versionId]/manifest">,
) {
  const { projectId, versionId } = await context.params;
  try {
    const version = await apiFetch<ContentVersion>(
      `/api/v1/projects/${encodeURIComponent(projectId)}` +
        `/content-versions/${encodeURIComponent(versionId)}`,
    );
    if (version.content?.version !== PLAYABLE_VERSION) {
      return Response.json({ message: "This version is not a playable V1 result." }, { status: 422 });
    }
    const prefix =
      `/api/projects/${encodeURIComponent(projectId)}` +
      `/content-versions/${encodeURIComponent(versionId)}/assets/`;
    return Response.json(sameOriginAssets(version.content, prefix), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return Response.json({ message: "Playable manifest is unavailable." }, { status: 502 });
  }
}
