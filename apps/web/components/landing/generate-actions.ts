"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { apiFetch, ApiError } from "@/lib/api";
import { isPublicPortfolioMode } from "@/lib/deployment-mode";
import type { GenerationJob, Project } from "@/lib/types";

/**
 * "Generate Game" on the landing page, wired to the platform API.
 *
 * Generation needs a project to own the content and a generation job inside it,
 * and neither exists before this runs — so the action does both, against the
 * endpoints the workspace already uses. No new backend surface:
 *
 *   POST /api/v1/projects                    (as createProjectAction does)
 *   POST /api/v1/projects/{id}/generations   (as generateContentAction does)
 *
 * On success it lands on the job page, which already polls for status.
 */

export interface GenerateGameState {
  error?: string;
  /**
   * Set when the project was created but generation did not start, so the work
   * so far can be linked instead of silently orphaned.
   */
  projectId?: string;
}

/** Matches the limit generateContentAction enforces. */
const MAX_PROMPT = 20_000;
/** Matches the limit createProjectAction enforces. */
const MAX_NAME = 160;

/** A readable project name from the prompt's opening words. */
function projectNameFrom(prompt: string) {
  const firstLine = prompt.split("\n")[0].replace(/\s+/g, " ").trim();
  if (!firstLine) return "Untitled world";
  const clipped = firstLine.length <= 60 ? firstLine : `${firstLine.slice(0, 57).trimEnd()}…`;
  return clipped.slice(0, MAX_NAME);
}

export async function generateGameAction(
  _previousState: GenerateGameState,
  formData: FormData,
): Promise<GenerateGameState> {
  // Server Actions remain directly addressable even when no form references
  // them. Public portfolio builds therefore refuse the mutation here as well
  // as routing the visible form through the static showcase replay.
  if (isPublicPortfolioMode()) {
    return { error: "Live generation is unavailable in the public showcase." };
  }

  const prompt = String(formData.get("prompt") ?? "").trim();

  if (!prompt) return { error: "Describe the world you want to generate." };
  if (prompt.length > MAX_PROMPT) {
    return { error: `Keep the description under ${MAX_PROMPT.toLocaleString()} characters.` };
  }

  // The API calls need a bearer token, so sign-in has to happen first. The
  // client stashes the prompt before submitting, and restores it on return.
  const session = await auth0.getSession();
  if (!session) redirect(`/auth/login?returnTo=${encodeURIComponent("/")}`);

  let project: Project;
  try {
    project = await apiFetch<Project>("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({ name: projectNameFrom(prompt), description: prompt }),
    });
  } catch (error) {
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "Could not create a project for this world.",
    };
  }

  let job: GenerationJob;
  try {
    job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(project.id)}/generations`,
      {
        method: "POST",
        // requestId makes the POST idempotent, as the workspace form does.
        body: JSON.stringify({ requestId: crypto.randomUUID(), prompt }),
      },
    );
  } catch (error) {
    // The project is real at this point; hand it back rather than lose it.
    return {
      error:
        error instanceof ApiError
          ? error.message
          : "The project was created, but generation did not start.",
      projectId: project.id,
    };
  }

  revalidatePath("/projects");
  redirect(
    `/projects/${encodeURIComponent(project.id)}/generations/${encodeURIComponent(job.id)}`,
  );
}
