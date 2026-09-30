"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ContentAsset, GenerationJob } from "@/lib/types";
import { useProjectRealtime } from "@/lib/project-realtime";
import styles from "./generation-console.module.css";

/** Segments in the marquee gauge. Presentational only. */
const SLOT_COUNT = 28;

/**
 * Boot-sequence flavour for the waiting states.
 *
 * Decorative: these are rendered `aria-hidden` and cycled in CSS, and the real
 * status heading and description sit beside them. They are keyed off the job's
 * own status rather than invented progress, because the API reports no stage.
 */
const RITUAL: Partial<Record<GenerationJob["status"], string[]>> = {
  QUEUED: ["Awaiting worker..."],
  RUNNING: ["Initializing world matrix...", "Forging assets...", "Composing scenes..."],
  CANCEL_REQUESTED: ["Halting sequence..."],
};

/** Collapses the status set onto the four colour tones the console paints. */
function toneFor(status: GenerationJob["status"]): "queued" | "running" | "done" | "failed" {
  if (status === "SUCCEEDED") return "done";
  if (status === "FAILED" || status === "CANCELLED" || status === "TIMED_OUT") return "failed";
  if (status === "RUNNING") return "running";
  return "queued";
}

/** The console's own id strip — the job id, shortened to fit. */
function slugFor(job: GenerationJob) {
  return `Gen-job · ${job.id.slice(0, 8)}`;
}

/** Bytes, for the asset captions. */
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "PLAYER_DIRECTION" -> "Player direction". */
function humanise(assetType: string) {
  const words = assetType.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A readable name for one stored asset, derived from its object key.
 *
 * Three assets share the type PLAYER_DIRECTION and two share MINION_SPRITE, so
 * the type alone cannot label a grid. The key's tail is what distinguishes
 * them: `.../player/down.png` is the down strip, and
 * `.../minions/brine-crawler/sprite.png` is that minion's.
 */
function assetName(key: string) {
  const segments = key.split("/").filter(Boolean);
  const stem = (segments.at(-1) ?? "").replace(/\.[a-z0-9]+$/i, "");
  const parent = segments.at(-2) ?? "";
  return stem === "sprite" || stem === "avatar" ? parent || stem : stem;
}

/**
 * One asset in the grid.
 *
 * The image is served by this project's own asset route rather than from object
 * storage, which is the only way the browser can read it at all — the storage
 * responses carry no CORS headers. Non-image assets get no preview; the
 * manifest JSON is the only one in practice, and it is listed under developer
 * details instead.
 */
function AssetTile({ asset, href }: { asset: ContentAsset; href: string | null }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(href) && !failed;

  return (
    <li className={styles.tile}>
      <div className={styles.thumb} data-empty={!showImage}>
        {showImage ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt={`${humanise(asset.assetType)} preview`}
            className={styles.thumbImage}
            loading="lazy"
            onError={() => setFailed(true)}
            src={href!}
          />
        ) : (
          <span className={styles.thumbNote} aria-hidden="true">
            {asset.contentType?.split("/")[1]?.toUpperCase() ?? "FILE"}
          </span>
        )}
      </div>
      <p className={styles.tileName}>{assetName(asset.key)}</p>
      <p className={styles.tileMeta}>
        {humanise(asset.assetType)}
        {asset.sizeBytes > 0 ? ` \u00b7 ${formatBytes(asset.sizeBytes)}` : ""}
      </p>
    </li>
  );
}

export function GenerationStatus({
  initialJob,
  replayAssets = [],
  replayJob,
}: {
  initialJob: GenerationJob;
  replayAssets?: ContentAsset[];
  replayJob?: GenerationJob;
}) {
  const [liveJob, setJob] = useState(initialJob);
  const job = replayJob ?? liveJob;
  const isReplay = Boolean(replayJob);
  const [pollError, setPollError] = useState<string | null>(null);
  const [commandPending, setCommandPending] = useState<"cancel" | "retry" | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const { connected, connectionEpoch, subscribe } = useProjectRealtime(job.projectId, !isReplay);

  const refreshJob = useCallback(async () => {
    if (refreshInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    refreshInFlight.current = true;
    try {
      do {
        refreshQueued.current = false;
        const response = await fetch(
          `/api/projects/${encodeURIComponent(job.projectId)}/generations/${encodeURIComponent(job.id)}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Could not refresh generation status.");
        setJob(await response.json() as GenerationJob);
        setPollError(null);
      } while (refreshQueued.current);
    } catch (error) {
      setPollError(error instanceof Error ? error.message : "Status refresh failed.");
    } finally {
      refreshInFlight.current = false;
    }
  }, [job.id, job.projectId]);

  useEffect(() => subscribe((event) => {
    if (isReplay) return;
    if (
      (event.eventType === "generation.job.updated" && event.entityId === job.id) ||
      event.eventType === "content.version.updated"
    ) void refreshJob();
  }), [isReplay, job.id, subscribe, refreshJob]);

  useEffect(() => {
    if (isReplay) return;
    if (connectionEpoch > 0) queueMicrotask(() => void refreshJob());
  }, [isReplay, connectionEpoch, refreshJob]);

  useEffect(() => {
    if (isReplay) return;
    if (connected || !["QUEUED", "RUNNING", "CANCEL_REQUESTED"].includes(job.status)) return;
    const timer = window.setInterval(() => void refreshJob(), 2000);
    return () => window.clearInterval(timer);
  }, [isReplay, job.status, connected, refreshJob]);

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

  const tone = toneFor(job.status);
  const projectHref = `/projects/${encodeURIComponent(job.projectId)}`;

  /* The chassis, shared by every state so the panel never changes shape. */
  const chrome = (
    <>
      <span className={styles.bracket} data-corner="tl" aria-hidden="true" />
      <span className={styles.bracket} data-corner="tr" aria-hidden="true" />
      <span className={styles.bracket} data-corner="bl" aria-hidden="true" />
      <span className={styles.bracket} data-corner="br" aria-hidden="true" />
    </>
  );

  const deck = (
    <header className={styles.deck}>
      <p className={styles.slug}>{slugFor(job)}</p>
      <div className={styles.readout}>
        {/*
          Honest about the transport: the two-second interval only runs while
          the event stream is down, so the label says which one is in play.
        */}
        <span className={styles.link} data-live={connected || isReplay}>
          {isReplay ? "Showcase replay" : connected ? "Live" : "Polling"}
        </span>
        <span className={styles.chip} data-tone={tone}>
          {job.status}
        </span>
      </div>
    </header>
  );

  const messages = (
    <>
      {pollError ? <p className={styles.error} role="alert">{pollError} Retrying…</p> : null}
      {commandError ? <p className={styles.error} role="alert">{commandError}</p> : null}
    </>
  );

  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(job.status)) {
    const descriptions: Partial<Record<GenerationJob["status"], string>> = {
      CANCELLED: "This generation was cancelled before its result was accepted.",
      FAILED: job.failureMessage || "The generation worker returned an error.",
      TIMED_OUT: job.failureMessage || "The generation did not finish before its deadline.",
    };
    return (
      <section className={styles.console} data-tone={tone} aria-live="polite">
        {chrome}
        {deck}
        <div className={styles.screen}>
          <span className={styles.scan} aria-hidden="true" />
          <p className={styles.attempt}>Attempt {job.attemptNumber}</p>
          <h2 className={styles.heading}>
            {job.status === "CANCELLED" ? "Generation cancelled" : "Generation did not complete"}
          </h2>
          <p className={styles.prose}>{descriptions[job.status]}</p>
        </div>
        <footer className={styles.actions}>
          <Link className={styles.switch} href={projectHref}>
            <span aria-hidden="true">←</span> Project
          </Link>
          {job.canRetry ? (
            <div className={styles.actionGroup}>
              <button
                className={styles.start}
                disabled={commandPending !== null}
                onClick={retryGeneration}
                type="button"
              >
                {commandPending === "retry" ? "Retrying…" : "Retry generation"}
              </button>
            </div>
          ) : null}
        </footer>
        {messages}
      </section>
    );
  }

  if (job.status !== "SUCCEEDED" || !job.contentVersion) {
    const descriptions: Partial<Record<GenerationJob["status"], string>> = {
      CANCEL_REQUESTED: "Cancellation is recorded. A late worker result will not complete this job.",
      QUEUED: "The request is durable and waiting for a worker.",
      RUNNING: `The worker is processing attempt ${job.attemptNumber}.`,
    };
    const lines = RITUAL[job.status] ?? [];
    return (
      <section className={styles.console} data-tone={tone} aria-live="polite">
        {chrome}
        {deck}
        <div className={styles.screen}>
          <span className={styles.scan} aria-hidden="true" />
          <p className={styles.attempt}>Attempt {job.attemptNumber}</p>

          <div
            className={styles.ritual}
            data-single={lines.length === 1}
            aria-hidden="true"
          >
            {lines.map((line, i) => (
              <span
                className={styles.ritualLine}
                key={line}
                style={{ ["--line-index" as string]: i }}
              >
                {line}
              </span>
            ))}
          </div>

          {/* Indeterminate: the API reports no percentage, so nothing fills. */}
          <div className={styles.slots} aria-hidden="true">
            {Array.from({ length: SLOT_COUNT }, (_, i) => (
              <i className={styles.slot} key={i} style={{ ["--slot-index" as string]: i }} />
            ))}
          </div>
          <span className={styles.trough} aria-hidden="true" />

          <h2 className={styles.heading}>
            {job.status === "CANCEL_REQUESTED"
              ? "Cancelling generation"
              : "The worker is generating content"}
          </h2>
          <p className={styles.prose}>
            {descriptions[job.status]}{" "}
            {isReplay
              ? "Validated showcase assets are arriving from the static demo bundle."
              : connected
              ? "Updates stream in as the worker reports them."
              : "The live stream is down, so this page re-checks status every two seconds."}
          </p>
          {isReplay && replayAssets.length > 0 ? (
            <>
              <h3 className={styles.subheading}>Assets</h3>
              <ul className={styles.grid}>
                {replayAssets.map((asset) => (
                  <AssetTile
                    asset={asset}
                    href={asset.contentType.startsWith("image/") ? asset.key : null}
                    key={`${asset.bucket}/${asset.key}`}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <footer className={styles.actions}>
          <Link className={styles.switch} href={projectHref}>
            <span aria-hidden="true">←</span> Project
          </Link>
          {job.canCancel ? (
            <div className={styles.actionGroup}>
              <button
                className={styles.switch}
                disabled={commandPending !== null}
                onClick={cancelGeneration}
                type="button"
              >
                {commandPending === "cancel" ? "Cancelling…" : "Cancel generation"}
              </button>
            </div>
          ) : null}
        </footer>
        {messages}
      </section>
    );
  }

  const version = job.contentVersion;
  const synopsis = typeof version.content.synopsis === "string" ? version.content.synopsis : null;
  const scenes = Array.isArray(version.content.scenes) ? version.content.scenes : [];
  const isPlayableV1 = version.content.version === "playable-game-content/v1";
  const playHref = isReplay
    ? "/demo"
    : `/playable?manifest=${encodeURIComponent(
        `/api/projects/${job.projectId}/generations/${job.id}/manifest`,
      )}`;

  /*
    Previews are served through this project's own asset route. Only keys the
    manifest declares are servable there, and only images are worth previewing,
    so everything else falls back to a type chip.
  */
  const assetPrefix = `/api/projects/${encodeURIComponent(job.projectId)}/generations/${encodeURIComponent(job.id)}/assets/`;
  const previewHref = (asset: ContentAsset) => {
    if (!asset.contentType?.startsWith("image/")) return null;
    return isReplay ? asset.key : `${assetPrefix}${encodeURI(asset.key)}`;
  };

  return (
    <section className={styles.console} data-tone={tone} aria-live="polite">
      {chrome}
      {deck}
      <div className={styles.screen}>
        <span className={styles.scan} aria-hidden="true" />
        <div className={styles.meta}>
          <span className={styles.chip} data-tone="done">{version.status}</span>
          <span className={styles.metaText}>Version {version.versionNumber}</span>
        </div>
        <h2 className={styles.heading}>{version.title}</h2>
        {synopsis ? <p className={styles.prose}>{synopsis}</p> : null}
        {scenes.length > 0 ? (
          <p className={styles.prose}>
            <strong>{scenes.length}</strong> generated scene{scenes.length === 1 ? "" : "s"}
          </p>
        ) : null}

        {/* The two things anyone actually came here to do. */}
        <div className={styles.primaryActions}>
          {isPlayableV1 ? (
            <a className={styles.start} href={playHref} rel="noreferrer" target="_blank">
              Play World
            </a>
          ) : null}
          <Link className={styles.switch} href={projectHref}>
            Open in Studio
          </Link>
        </div>

        {/*
          A metadata-only version has nothing to show here: the showcase
          entries that are not playable bundles carry no assets at all.
          Without this guard the page rendered a bare "Assets" heading over
          an empty grid and an empty developer panel, which reads as a load
          failure rather than as "nothing to show".
        */}
        {version.assets.length > 0 ? (
          <>
            <h3 className={styles.subheading}>Assets</h3>
            <ul className={styles.grid}>
              {version.assets.map((asset) => (
                <AssetTile
                  asset={asset}
                  href={previewHref(asset)}
                  key={`${asset.bucket}/${asset.key}`}
                />
              ))}
            </ul>

            {/*
              The raw storage paths are genuinely useful when something is wrong and
              noise the rest of the time, so they are here but shut by default.
            */}
            <details className={styles.dev}>
              <summary className={styles.devSummary}>Developer details</summary>
              <dl className={styles.rawList}>
                {version.assets.map((asset) => (
                  <div className={styles.rawRow} key={`raw-${asset.bucket}/${asset.key}`}>
                    <dt className={styles.rawType}>{asset.assetType}</dt>
                    <dd className={styles.rawPath}>
                      <code>s3://{asset.bucket}/{asset.key}</code>
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          </>
        ) : null}
      </div>
      {messages}
    </section>
  );
}
