import Link from "next/link";
import { notFound } from "next/navigation";
import { GenerationStatus } from "@/components/generation-status";
import { ApiError, apiFetch } from "@/lib/api";
import type { GenerationJob } from "@/lib/types";

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { id, jobId } = await params;
  let job: GenerationJob;
  try {
    job = await apiFetch<GenerationJob>(
      `/api/v1/projects/${encodeURIComponent(id)}/generations/${encodeURIComponent(jobId)}`,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }

  return (
    <div className="generation-page">
      <Link className="back-link" href={`/projects/${encodeURIComponent(id)}`}>← Project</Link>
      <p className="eyebrow">Generation job</p>
      <h1>Creating your draft</h1>
      <GenerationStatus initialJob={job} />
    </div>
  );
}
