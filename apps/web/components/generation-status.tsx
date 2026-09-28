"use client";

import { useEffect, useState } from "react";
import type { GenerationJob } from "@/lib/types";

export function GenerationStatus({ initialJob }: { initialJob: GenerationJob }) {
  const [job, setJob] = useState(initialJob);
  const [pollError, setPollError] = useState<string | null>(null);

  useEffect(() => {
    if (job.status !== "QUEUED") return;
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

  if (job.status === "FAILED") {
    return (
      <section className="generation-result generation-result--failed" aria-live="polite">
        <span className="status status--failed">FAILED</span>
        <h2>Generation did not complete</h2>
        <p>{job.failureMessage || "The generation worker returned an error."}</p>
      </section>
    );
  }

  if (job.status === "QUEUED" || !job.contentVersion) {
    return (
      <section className="generation-result" aria-live="polite">
        <span className="status status--queued">QUEUED</span>
        <h2>The worker is generating content</h2>
        <p>Your request is durable. This page checks PostgreSQL-backed status every two seconds.</p>
        {pollError ? <p className="form-error" role="alert">{pollError} Retrying…</p> : null}
      </section>
    );
  }

  const version = job.contentVersion;
  const synopsis = typeof version.content.synopsis === "string" ? version.content.synopsis : null;
  const scenes = Array.isArray(version.content.scenes) ? version.content.scenes : [];

  return (
    <section className="generation-result" aria-live="polite">
      <div className="project-card__meta">
        <span className="status status--active">{version.status}</span>
        <span>Version {version.versionNumber}</span>
      </div>
      <h2>{version.title}</h2>
      {synopsis ? <p>{synopsis}</p> : null}
      {scenes.length > 0 ? <p><strong>{scenes.length}</strong> generated scene{scenes.length === 1 ? "" : "s"}</p> : null}
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
