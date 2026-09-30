import { ApiError, apiFetch } from "@/lib/api";
import { objectKeyFrom, serveDeclaredAsset } from "@/lib/playable-assets";
import type { ContentVersion } from "@/lib/types";

/** Assets for a version-addressed manifest. See the manifest route alongside. */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/projects/[projectId]/content-versions/[versionId]/assets/[...key]">,
) {
  const { projectId, versionId, key } = await context.params;
  const objectKey = objectKeyFrom(key);
  if (!objectKey) return Response.json({ message: "Missing asset key." }, { status: 400 });

  let version: ContentVersion;
  try {
    version = await apiFetch<ContentVersion>(
      `/api/v1/projects/${encodeURIComponent(projectId)}` +
        `/content-versions/${encodeURIComponent(versionId)}`,
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ message: error.message }, { status: error.status });
    }
    return Response.json({ message: "Asset is unavailable." }, { status: 502 });
  }

  return serveDeclaredAsset(version.content, objectKey);
}
