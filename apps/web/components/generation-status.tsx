"use client";

import { useEffect, useState } from "react";
import type { GenerationJob } from "@/lib/types";

export function GenerationStatus({ initialJob }: { initialJob: GenerationJob }) {
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);
  const [commandPending, setCommandPending] = useState<"cancel" | "retry" | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  useEffect(() => {
    if (!["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(job.status)) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(
          `/api/projects/${encodeURIComponent(job.projectId)}/generations/${encodeURIComponent(job.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Could not refresh generation status.");
        const nextJob = await response.json() as GenerationJob;
        if (!cancelled) {
          setJob(nextJob);
          setPollError(null);
        }
      } catch (error) {
        if (!cancelled) setPollError(error instanceof Error ? error.message : "Status refresh failed.");
      }
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [job.id, job.projectId, job.status]);

  async function cancelGeneration() {
    setCommandPending("cancel");
    setCommandError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(job.projectId)}/generation-jobs/${encodeURIComponent(job.id)}/cancel`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("Could not cancel this generation.");
      setJob(await response.json() as GenerationJob);
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Cancellation failed.");
    } finally {
      setCommandPending(null);
    }
  }

  async function retryGeneration() {
    setCommandPending("retry");
    setCommandError(null);
    try {
      const response = await fetch(
        `/api/projects/${encodeURIComponent(job.projectId)}/generation-jobs/${encodeURIComponent(job.id)}/retry`,
        {
          body: JSON.stringify({ requestId: crypto.randomUUID() }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("Could not retry this generation.");
      const retriedJob = await response.json() as GenerationJob;
      setJob(retriedJob);
      window.history.replaceState(
        null,
        "",
        `/projects/${encodeURIComponent(retriedJob.projectId)}/generations/${encodeURIComponent(retriedJob.id)}`,
      );
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setCommandPending(null);
    }
  }

  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(job.status)) {
    const descriptions: Partial<Record<GenerationJob["status"], string>> = {
      CANCELLED: "This generation was cancelled before its result was accepted.",
      FAILED: job.failureMessage || "The generation worker returned an error.",
      TIMED_OUT: job.failureMessage || "The generation did not finish before its deadline.",
    };
    return (
      <section className="generation-result generation-result--failed" aria-live="polite">
        <span className={`status status--${job.status.toLowerCase().replace("_", "-")}`}>{job.status}</span>
        <h2>{job.status === "CANCELLED" ? "Generation cancelled" : "Generation did not complete"}</h2>
        <p>{descriptions[job.status]}</p>
        {job.canRetry ? (
          <button className="button" disabled={commandPending !== null} onClick={retryGeneration} type="button">
            {commandPending === "retry" ? "Retrying…" : "Retry generation"}
          </button>
        ) : null}
        {commandError ? <p className="form-error" role="alert">{commandError}</p> : null}
      </section>
    );
  }

  if (job.status !== "SUCCEEDED" || !job.contentVersion) {
    const descriptions: Partial<Record<GenerationJob["status"], string>> = {
      CANCEL_REQUESTED: "Cancellation is recorded. A late worker result will not complete this job.",
      QUEUED: "The request is durable and waiting for a worker.",
      RUNNING: `The worker is processing attempt ${job.attemptNumber}.`,
    };
    return (
      <section className="generation-result" aria-live="polite">
        <span className={`status status--${job.status.toLowerCase().replace("_", "-")}`}>{job.status}</span>
        <h2>{job.status === "CANCEL_REQUESTED" ? "Cancelling generation" : "The worker is generating content"}</h2>
        <p>{descriptions[job.status]} This page checks PostgreSQL-backed status every two seconds.</p>
        {job.canCancel ? (
          <button className="button button--secondary" disabled={commandPending !== null} onClick={cancelGeneration} type="button">
            {commandPending === "cancel" ? "Cancelling…" : "Cancel generation"}
          </button>
        ) : null}
        {pollError ? <p className="form-error" role="alert">{pollError} Retrying…</p> : null}
        {commandError ? <p className="form-error" role="alert">{commandError}</p> : null}
      </section>
    );
  }

  const version = job.contentVersion;
  const synopsis = typeof version.content.synopsis === "string" ? version.content.synopsis : null;
  const scenes = Array.isArray(version.content.scenes) ? version.content.scenes : [];
  const isPlayableV1 = version.content.version === "playable-game-content/v1";

  return (
    <section className="generation-result" aria-live="polite">
      <div className="project-card__meta">
        <span className="status status--active">{version.status}</span>
        <span>Version {version.versionNumber}</span>
      </div>
      <h2>{version.title}</h2>
      {synopsis ? <p>{synopsis}</p> : null}
      {scenes.length > 0 ? <p><strong>{scenes.length}</strong> generated scene{scenes.length === 1 ? "" : "s"}</p> : null}
      {isPlayableV1 ? (
        <a
          className="button"
          href={`/playable?manifest=${encodeURIComponent(`/api/projects/${job.projectId}/generations/${job.id}/manifest`)}`}
          rel="noreferrer"
          target="_blank"
        >
          Play game
        </a>
      ) : null}
      <h3>Stored assets</h3>
      <ul className="asset-list">
        {version.assets.map((asset) => (
          <li key={`${asset.bucket}/${asset.key}`}>
            <strong>{asset.assetType}</strong>
            <code>s3://{asset.bucket}/{asset.key}</code>
          </li>
        ))}
      </ul>
    </section>
  );
}
