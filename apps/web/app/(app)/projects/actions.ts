"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import type { Project } from "@/lib/types";

export interface CreateProjectState { error?: string }

export async function createProjectAction(
  _previousState: CreateProjectState,
  formData: FormData,
): Promise<CreateProjectState> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!name) return { error: "Project name is required." };
  if (name.length > 160) return { error: "Project name must be 160 characters or fewer." };
  if (description.length > 10_000) return { error: "Description must be 10,000 characters or fewer." };

  let project: Project;
  try {
    project = await apiFetch<Project>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name, description: description || null }),
    });
  } catch (error) {
    return { error: error instanceof ApiError ? error.message : "Could not create the project." };
  }

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}
