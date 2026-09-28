"use server";

import { revalidatePath } from "next/cache";
import { ApiError, apiFetch } from "@/lib/api";

export interface ReviewActionState { error?: string; success?: string }

export async function submitForReviewAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  if (!projectId || !versionId || !requestId) return { error: "Review request is incomplete." };
  try {
    await apiFetch(`/api/v1/projects/${encodeURIComponent(projectId)}/content-versions/${encodeURIComponent(versionId)}/review-requests`, {
      body: JSON.stringify({ requestId }),
      method: "POST",
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Could not submit this version for review." };
  }
  revalidatePath(`/projects/${projectId}`);
  return { success: "Submitted for review." };
}

export async function decideReviewAction(
  _previousState: ReviewActionState,
  formData: FormData,
): Promise<ReviewActionState> {
  const projectId = String(formData.get("projectId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  const reviewRequestId = String(formData.get("reviewRequestId") ?? "");
  const requestId = String(formData.get("requestId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const comment = String(formData.get("comment") ?? "").trim();
  if (!projectId || !versionId || !reviewRequestId || !requestId) {
    return { error: "Review decision is incomplete." };
  }
  if (decision !== "APPROVE" && decision !== "REQUEST_CHANGES") {
    return { error: "Choose a valid review decision." };
  }
  const command = decision === "APPROVE" ? "approve" : "request-changes";
  try {
    await apiFetch(
      `/api/v1/projects/${encodeURIComponent(projectId)}/content-versions/${encodeURIComponent(versionId)}/review-requests/${encodeURIComponent(reviewRequestId)}/${command}`,
      { body: JSON.stringify({ requestId, comment: comment || null }), method: "POST" },
    );
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Could not record this review decision." };
  }
  revalidatePath(`/projects/${projectId}`);
  return { success: decision === "APPROVE" ? "Approval recorded." : "Changes requested." };
}
