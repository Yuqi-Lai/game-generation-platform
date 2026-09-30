"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_MANIFEST_PATH, playableHref } from "@/components/landing/routes";
import { validatePlayableManifest, type ManifestProblem } from "./playable-contract";
import styles from "./demo.module.css";

/** How long to wait for the runtime to put a canvas on the page. */
const READY_TIMEOUT_MS = 20_000;
const POLL_MS = 120;

type Phase = "preparing" | "idle" | "starting" | "playing" | "failed";

/** What the runtime actually binds — see `keys` in public/playable/runtime.js. */
const CONTROLS: Array<[string, string]> = [
  ["W A S D", "Move"],
  ["Shift", "Run"],
  ["Space", "Interact"],
  ["Esc", "Close"],
  ["P", "Profile"],
];

/** The splash copy is read from the manifest, so it never drifts from the build. */
interface DemoDetails {
  title: string;
  blurb: string;
  scene: string;
  objective: string;
  keyArt: string | null;
}

function readDetails(manifest: unknown): DemoDetails {
  const source = (manifest ?? {}) as Record<string, unknown>;
  const scenes = Array.isArray(source.scenes) ? (source.scenes as Record<string, unknown>[]) : [];
  const assets = Array.isArray(source.assets) ? (source.assets as Record<string, unknown>[]) : [];
  const background = assets.find((asset) => asset.role === "SCENE_BACKGROUND");
  const key = (background?.url ?? background?.objectKey) as string | undefined;

  return {
    title: typeof source.title === "string" ? source.title : "Playable demo",
    blurb: typeof source.openingRemarks === "string" ? source.openingRemarks : "",
    scene: typeof scenes[0]?.title === "string" ? (scenes[0].title as string) : "",
    objective: typeof scenes[0]?.objective === "string" ? (scenes[0].objective as string) : "",
    // Only origin-relative keys are safe to render directly as an <img>.
    keyArt: key?.startsWith("/") ? key : null,
  };
}

/**
 * The public demo shell.
 *
 * The Phaser runtime is a self-executing global script that reads its manifest
 * from `window.location.search` and mounts into `#game-container`. Rather than
 * fork it, this embeds the existing `/playable` route in an iframe and owns
 * every user-visible state around it:
 *
 *   - the manifest is fetched and checked here first, so an unplayable manifest
 *     is a readable message rather than the runtime throwing into a hidden
 *     `debugText` object and leaving a black screen;
 *   - a splash card holds the screen until the player starts, which also means
 *     Phaser is not downloaded until someone actually wants to play;
 *   - readiness is observed by watching for the canvas the runtime creates;
 *   - retry remounts the iframe, which re-evaluates the script from scratch —
 *     the only clean way to restart a global script that runs on load.
 */
export default function DemoExperience() {
  /*
    Retry bumps this key, which remounts the run below. That resets every piece
    of state at once and re-evaluates the runtime script from scratch — the only
    clean way to restart a global script that executes on load, and it keeps the
    reset out of an effect body.
  */
  const [attempt, setAttempt] = useState(0);
  return <DemoRun key={attempt} onRetry={() => setAttempt((value) => value + 1)} />;
}

function DemoRun({ onRetry }: { onRetry: () => void }) {
  const [phase, setPhase] = useState<Phase>("preparing");
  const [failure, setFailure] = useState<ManifestProblem | null>(null);
  const [details, setDetails] = useState<DemoDetails | null>(null);
  const [artFailed, setArtFailed] = useState(false);
  const [engaged, setEngaged] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const fail = useCallback((problem: ManifestProblem) => {
    setFailure(problem);
    setPhase("failed");
  }, []);

  // Check the manifest before offering anyone a game surface.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      let payload: unknown;
      try {
        const response = await fetch(DEMO_MANIFEST_PATH, { cache: "no-store" });
        if (!response.ok) {
          if (cancelled) return;
          fail({
            title: "Could not load the demo",
            detail: `Fetching the manifest returned ${response.status}.`,
          });
          return;
        }
        payload = await response.json();
      } catch {
        if (cancelled) return;
        fail({
          title: "Could not load the demo",
          detail: "The manifest could not be fetched or did not contain valid JSON.",
        });
        return;
      }

      if (cancelled) return;
      const problem = validatePlayableManifest(payload);
      if (problem) {
        fail(problem);
        return;
      }
      setDetails(readDetails(payload));
      setPhase("idle");
    })();

    return () => {
      cancelled = true;
    };
  }, [fail]);

  const start = useCallback(() => setPhase("starting"), []);

  // Space or Enter launches it, the way a cabinet would.
  useEffect(() => {
    if (phase !== "idle") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== " " && event.key !== "Enter") return;
      // Leave the button's own activation to the browser.
      if ((event.target as HTMLElement)?.closest?.("button, a, input, textarea")) return;
      event.preventDefault();
      start();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phase, start]);

  // Watch for the canvas the runtime mounts into #game-container.
  useEffect(() => {
    if (phase !== "starting") return;
    const deadline = Date.now() + READY_TIMEOUT_MS;

    const poll = window.setInterval(() => {
      const frame = frameRef.current;
      let canvas: HTMLCanvasElement | null = null;
      try {
        canvas = frame?.contentDocument?.querySelector("#game-container canvas") ?? null;
      } catch {
        // Same-origin, so this should not throw; treat it as not-ready-yet.
        canvas = null;
      }

      if (canvas) {
        window.clearInterval(poll);
        setPhase("playing");
        return;
      }

      if (Date.now() > deadline) {
        window.clearInterval(poll);
        fail({
          title: "The demo did not start",
          detail: "The game runtime loaded but never produced a playable surface.",
        });
      }
    }, POLL_MS);

    return () => window.clearInterval(poll);
  }, [phase, fail]);

  // Keys only reach the game once the iframe has focus, so track that.
  useEffect(() => {
    if (!engaged) return;
    const onWindowFocus = () => setEngaged(false);
    window.addEventListener("focus", onWindowFocus);
    return () => window.removeEventListener("focus", onWindowFocus);
  }, [engaged]);

  const engage = useCallback(() => {
    frameRef.current?.contentWindow?.focus();
    setEngaged(true);
  }, []);

  const showFrame = phase === "starting" || phase === "playing";
  const phaseLabel = {
    preparing: "Booting",
    idle: "Insert coin",
    starting: "Loading",
    playing: "Running",
    failed: "Stopped",
  }[phase];

  return (
    <main className={styles.demo}>
      <header className={styles.bar}>
        <Link className={styles.back} href="/">
          <span aria-hidden="true">←</span> Back
        </Link>
        <p className={styles.title}>Playable demo</p>
        <p className={styles.phase} data-phase={phase}>
          {phaseLabel}
        </p>
      </header>

      {/* The cabinet: bezel, corner brackets, CRT wash. */}
      <div className={styles.cabinet}>
        <div className={styles.stage} data-phase={phase}>
          {showFrame ? (
            <iframe
              ref={frameRef}
              className={styles.frame}
              data-state={phase}
              src={playableHref(DEMO_MANIFEST_PATH)}
              title="Playable demo"
              /* The runtime needs keyboard and its own scripts; nothing else. */
              sandbox="allow-scripts allow-same-origin"
            />
          ) : null}

          {/* Scanlines and bezel glow, over whatever the stage is showing. */}
          <span className={styles.crt} aria-hidden="true" />
          <span className={styles.bracket} data-corner="tl" aria-hidden="true" />
          <span className={styles.bracket} data-corner="tr" aria-hidden="true" />
          <span className={styles.bracket} data-corner="bl" aria-hidden="true" />
          <span className={styles.bracket} data-corner="br" aria-hidden="true" />

          {phase === "preparing" ? (
            <div className={styles.overlay} role="status" aria-live="polite">
              <span className={styles.loader} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p className={styles.overlayTitle}>Booting the cabinet</p>
              <p className={styles.overlayNote}>Checking the content manifest.</p>
            </div>
          ) : null}

          {phase === "idle" && details ? (
            <div className={styles.splash}>
              {details.keyArt && !artFailed ? (
                <div className={styles.art}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`${details.scene || details.title} — key art`}
                    className={styles.artImage}
                    onError={() => setArtFailed(true)}
                    src={details.keyArt}
                  />
                </div>
              ) : null}

              <p className={styles.splashLabel}>{details.scene || "Playable demo"}</p>
              <h1 className={styles.splashTitle}>{details.title}</h1>
              {details.blurb ? <p className={styles.splashBlurb}>{details.blurb}</p> : null}

              <button className={styles.start} onClick={start} type="button">
                Start demo
              </button>
              <p className={styles.startHint}>
                or press <kbd className={styles.keycap}>Space</kbd>
              </p>
            </div>
          ) : null}

          {phase === "starting" ? (
            <div className={styles.overlay} role="status" aria-live="polite">
              <span className={styles.loader} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <p className={styles.overlayTitle}>Loading the world</p>
              <p className={styles.overlayNote}>Tilemap, sprites and systems.</p>
            </div>
          ) : null}

          {phase === "failed" && failure ? (
            <div className={styles.overlay} role="alert">
              <p className={styles.overlayLabel}>Demo unavailable</p>
              <p className={styles.overlayTitle}>{failure.title}</p>
              <p className={styles.overlayNote}>{failure.detail}</p>
              <div className={styles.overlayActions}>
                <button className={styles.primary} onClick={onRetry} type="button">
                  Try again
                </button>
                <Link className={styles.secondary} href="/">
                  Back to site
                </Link>
              </div>
            </div>
          ) : null}

          {phase === "playing" && !engaged ? (
            <button className={styles.engage} onClick={engage} type="button">
              <span className={styles.engageLabel}>Click to play</span>
              <span className={styles.engageNote}>The game needs keyboard focus</span>
            </button>
          ) : null}
        </div>
      </div>

      <footer className={styles.controls} aria-label="Keyboard controls">
        {CONTROLS.map(([key, action]) => (
          <span className={styles.control} key={key}>
            <kbd className={styles.keycap}>{key}</kbd>
            <span className={styles.controlAction}>{action}</span>
          </span>
        ))}
      </footer>
    </main>
  );
}
