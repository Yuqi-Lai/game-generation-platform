import { notFound } from "next/navigation";
import { GenerationStatus } from "@/components/generation-status";
import { ApiError, apiFetch } from "@/lib/api";
import type { GenerationJob } from "@/lib/types";
import styles from "@/components/generation-console.module.css";
import PublicGenerationReplay from "@/components/landing/public-generation-replay";
import { isPublicPortfolioMode } from "@/lib/deployment-mode";
import { getShowcaseGeneration, isPlayableShowcaseGeneration } from "@/lib/showcase-data";

export default async function GenerationPage({
  params,
}: {
  params: Promise<{ id: string; jobId: string }>;
}) {
  const { id, jobId } = await params;
  const showcase = isPublicPortfolioMode();
  let job: GenerationJob;
  if (showcase) {
    const staticJob = getShowcaseGeneration(id, jobId);
    if (!staticJob) notFound();
    job = staticJob;
  } else {
    try {
      job = await apiFetch<GenerationJob>(
        `/api/v1/projects/${encodeURIComponent(id)}/generations/${encodeURIComponent(jobId)}`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    }
  }

  /*
    The way back to the project lives in the console's action deck rather than
    above the title, so the panel reads as one self-contained machine.
  */
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Generation job</p>
        <h1 className={styles.title}>Creating your draft</h1>
      </header>
      {showcase && isPlayableShowcaseGeneration(id, jobId) ? (
        <PublicGenerationReplay completedJob={job} />
      ) : showcase ? (
        <GenerationStatus initialJob={job} replayJob={job} />
      ) : (
        <GenerationStatus initialJob={job} />
      )}
    </div>
  );
}
