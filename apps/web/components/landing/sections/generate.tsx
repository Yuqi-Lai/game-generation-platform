"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import WorldCanvas from "../world-canvas";
import PixelTitle from "../pixel-title";
import Magnetic from "../magnetic";
import { useCursorTarget } from "../cursor/cursor-context";
import { WORLDS } from "../worlds";
import { generateGameAction } from "../generate-actions";
import { SHOWCASE_JOB_HREF, SHOWCASE_STORY } from "@/lib/showcase-routes";
import styles from "../landing.module.css";

/** The cyberpunk skyline: animated pixel towers, lit windows, signage, rain. */
const BACKDROP = WORLDS.find((w) => w.id === "neon-sector") ?? WORLDS[0];

/* The field runs in the body sans now, so the whole punctuation range is
   available; the plain periods stay because they read quieter than a true
   ellipsis at this size. */
const PLACEHOLDER = "A seaside farm at first thaw, eight tilled rows, a well that draws saltwater...";

/** Survives the round trip through sign-in, which is a full page load. */
const DRAFT_KEY = "forge:prompt-draft";

/**
 * The closing section: one prompt box over a living pixel skyline.
 *
 * The button really generates. `generateGameAction` creates a project and
 * starts a generation job against the existing API, then lands on the job page.
 */
export default function Generate({
  signedIn,
  publicPortfolioMode = false,
}: {
  signedIn: boolean;
  publicPortfolioMode?: boolean;
}) {
  const [state, action, pending] = useActionState(generateGameAction, {});
  const [seedIsMuted, setSeedIsMuted] = useState(publicPortfolioMode);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const link = useCursorTarget("link");

  /*
    The field is uncontrolled on purpose. Its value is not React state — it is
    read from the DOM on submit — which keeps the draft restore out of render
    entirely, avoids a hydration mismatch between the server (no sessionStorage)
    and the client, and means the text survives a failed submit for free.
  */
  useEffect(() => {
    if (publicPortfolioMode) return;
    try {
      const draft = window.sessionStorage.getItem(DRAFT_KEY);
      if (draft && inputRef.current) {
        inputRef.current.value = draft;
        window.sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch {
      // Private mode or blocked storage: the draft is a convenience, not state.
    }
  }, [publicPortfolioMode]);

  const stashDraft = () => {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, inputRef.current?.value ?? "");
    } catch {
      /* no-op */
    }
  };

  const formPending = publicPortfolioMode ? false : pending;

  return (
    <section
      className={`${styles.section} ${styles.generate}`}
      id="generate"
      aria-labelledby="generate-title"
    >
      <div className={styles.generateBackdrop} aria-hidden="true">
        <WorldCanvas world={BACKDROP} cover label="" />
      </div>
      <div className={styles.generateScrim} aria-hidden="true" />

      <div className={styles.generateInner}>
        <p className={styles.meta}>03 — Generate</p>

        <PixelTitle as="h2" id="generate-title" text="BUILD YOUR GAME" />

        <form
          className={styles.promptBox}
          action={publicPortfolioMode ? SHOWCASE_JOB_HREF : action}
          method={publicPortfolioMode ? "get" : undefined}
          onSubmit={publicPortfolioMode ? undefined : stashDraft}
        >
          <label className={styles.promptLabel} htmlFor="prompt">
            Describe your world
          </label>
          <textarea
            ref={inputRef}
            className={`${styles.promptInput} ${seedIsMuted ? styles.promptInputSeed : ""}`}
            id="prompt"
            name={publicPortfolioMode ? undefined : "prompt"}
            rows={3}
            defaultValue={publicPortfolioMode ? SHOWCASE_STORY : ""}
            placeholder={PLACEHOLDER}
            disabled={formPending}
            onChange={() => setSeedIsMuted(false)}
            onFocus={() => setSeedIsMuted(false)}
            {...link}
          />

          {!publicPortfolioMode && state.error ? (
            <p className={styles.promptError} role="alert">
              {state.error}
              {state.projectId ? (
                <>
                  {" "}
                  <Link className={styles.promptErrorLink} href={`/projects/${state.projectId}`}>
                    Open the project →
                  </Link>
                </>
              ) : null}
            </p>
          ) : null}

          <div className={styles.promptFoot}>
            <p className={styles.meta}>
              {publicPortfolioMode
                ? "Public demo · no live AI request"
                : signedIn ? "Tilemap · sprites · systems" : "You will sign in first"}
            </p>
            <Magnetic strength={0.2}>
              <button className={styles.cta} type="submit" disabled={formPending} {...link}>
                Generate Game
                <span className={styles.ctaArrow} aria-hidden="true">
                  →
                </span>
              </button>
            </Magnetic>
          </div>
        </form>
      </div>
    </section>
  );
}
