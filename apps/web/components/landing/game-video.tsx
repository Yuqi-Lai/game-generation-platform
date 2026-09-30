"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import WorldCanvas from "./world-canvas";
import { WORLDS } from "./worlds";
import type { GameClip } from "./media";
import styles from "./landing.module.css";

interface GameVideoProps {
  clip: GameClip;
  /** Paused until needed, for off-screen or inactive surfaces. */
  active?: boolean;
  /** Show the corner pause/play control and let the surface be clicked. */
  controls?: boolean;
  className?: string;
}

/**
 * How early to restart, in seconds.
 *
 * The clip's audio track runs ~48ms longer than its video track, so the tail of
 * the file has sound but no frames. Waiting for `ended` therefore means playing
 * out that frameless tail and only then seeking — which shows as a black pause.
 * Jumping back just before the video track ends skips it, and never lets the
 * decoder tear down. 0.3s is comfortably clear of both track ends and
 * imperceptible in a 30s clip.
 */
const LOOP_LEAD_SECONDS = 0.3;

/**
 * Your footage, filling the frame with `object-fit: cover`.
 *
 * Autoplay is belt-and-braces: React sets `muted` as a property, and browsers
 * only grant muted autoplay when the element is muted *before* playback is
 * attempted — so the effect asserts it on the DOM node and calls `play()`
 * itself, swallowing the rejection when a policy still blocks it.
 *
 * If the file is not there the load error swaps in the procedural pixel scene,
 * so the layout is identical either way.
 *
 * No `poster`: pointing one at a file that does not exist is a failed image
 * load, and browsers draw a broken-image placeholder for it.
 */
export default function GameVideo({
  clip,
  active = true,
  controls = false,
  className,
}: GameVideoProps) {
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active) return;
    video.muted = true;
    // `play()` only returns a promise in reasonably modern browsers; older ones
    // and jsdom return undefined. When it is a promise it rejects on a blocked
    // autoplay policy or an unplayable source — the error event covers the
    // latter, so there is nothing to do here except not throw.
    const started: unknown = video.play();
    if (started instanceof Promise) started.catch(() => {});
  }, [active, clip.src]);

  /*
    Gapless loop, and keep the button's label honest if playback changes for any
    other reason (a policy block, the user hitting a media key).
  */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const restartEarly = () => {
      if (video.paused || !Number.isFinite(video.duration)) return;
      if (video.duration - video.currentTime <= LOOP_LEAD_SECONDS) video.currentTime = 0;
    };
    const syncPaused = () => setPaused(video.paused);

    video.addEventListener("timeupdate", restartEarly);
    video.addEventListener("play", syncPaused);
    video.addEventListener("pause", syncPaused);
    return () => {
      video.removeEventListener("timeupdate", restartEarly);
      video.removeEventListener("play", syncPaused);
      video.removeEventListener("pause", syncPaused);
    };
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const started: unknown = video.play();
      if (started instanceof Promise) started.catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  if (failed) {
    const world = WORLDS.find((w) => w.id === clip.fallbackWorldId) ?? WORLDS[0];
    return <WorldCanvas world={world} className={className} label={`${clip.label} — preview`} />;
  }

  const video = (
    <video
      ref={videoRef}
      className={`${styles.gameVideo} ${className ?? ""}`}
      src={clip.src}
      autoPlay={active}
      /* `loop` stays as a safety net for the case where `timeupdate` is too
         coarse to catch the tail; the early restart normally gets there first. */
      loop
      muted
      playsInline
      preload={active ? "auto" : "metadata"}
      aria-label={`${clip.label} — ${clip.kind} gameplay`}
      onError={() => setFailed(true)}
    />
  );

  if (!controls) return video;

  return (
    <div className={styles.videoShell}>
      {video}

      {/*
        Clicking the picture toggles playback. A span rather than a button on
        purpose: the corner control below is the real, focusable control, and a
        second button for the same action would only add a duplicate tab stop.
        Siblings, so a click on the button does not also reach this layer.
      */}
      <span className={styles.videoHit} role="presentation" onClick={toggle} />

      <button
        className={styles.videoToggle}
        type="button"
        onClick={toggle}
        aria-label={paused ? `Play the ${clip.label} clip` : `Pause the ${clip.label} clip`}
      >
        <span className={styles.videoToggleGlyph} aria-hidden="true">
          {paused ? "\u25B6" : "\u275A\u275A"}
        </span>
        {paused ? "Play" : "Pause"}
      </button>
    </div>
  );
}
