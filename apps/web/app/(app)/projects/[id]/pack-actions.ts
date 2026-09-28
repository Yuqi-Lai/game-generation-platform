"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";

export interface PackActionState { error?: string; success?: string }

export async function contentPackAction(
  _previousState: PackActionState,
  formData: FormData,
): Promise<PackActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const packId = String(formData.get("packId") ?? "");
  const operation = String(formData.get("operation") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  if (!projectId) return { error: "Project is required." };
  let path = `/api/v1/projects/${encodeURIComponent(projectId)}/content-packs`;
  let method = "POST";
  let body: Record<string, string> | undefined;
  if (operation === "create") {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Pack name is required." };
    body = { name };
  } else if (!packId) {
    return { error: "Content pack is required." };
  } else if (operation === "add") {
    if (!versionId) return { error: "Choose an approved version." };
    path += `/${encodeURIComponent(packId)}/items`;
    body = { contentVersionId: versionId };
  } else if (operation === "remove") {
    if (!versionId) return { error: "Content version is required." };
    path += `/${encodeURIComponent(packId)}/items/${encodeURIComponent(versionId)}`;
    method = "DELETE";
  } else if (operation === "ready") {
    path += `/${encodeURIComponent(packId)}/ready`;
  } else if (operation === "export") {
    path += `/${encodeURIComponent(packId)}/exports`;
    body = { requestId: String(formData.get("requestId") ?? "") };
  } else {
    return { error: "Unsupported pack action." };
  }
  try {
    await apiFetch(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Could not update the content pack." };
  }
  revalidatePath(`/projects/${projectId}`);
  return { success: "Content pack updated." };
}
