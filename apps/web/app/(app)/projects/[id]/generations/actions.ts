"use server";

import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { GenerationJob } from "@/lib/types";

export interface GenerateContentState { error?: string }

export async function generateContentAction(
  _previousState: GenerateContentState,
  formData: FormData,
): Promise<GenerateContentState> {
  const projectId = String(formData.get("projectId") ?? "");
  const prompt = String(formData.get("prompt") ?? "").trim();

  if (!projectId) return { error: "Project is required." };
  if (!prompt) return { error: "Describe the content you want to generate." };
  if (prompt.length > 20_000) return { error: "Prompt must be 20,000 characters or fewer." };

  let job: GenerationJob;
  try {
    job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/generations`,
      { method: "POST", body: JSON.stringify({ prompt }) },
    );
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Could not start generation." };
  }

  redirect(`/projects/${encodeURIComponent(job.projectId)}/generations/${encodeURIComponent(job.id)}`);
}
