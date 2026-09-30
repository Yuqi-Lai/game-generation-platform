"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import GameVideo from "../game-video";
import AnimatedTitle from "../animated-title";
import Magnetic from "../magnetic";
import { useCursorTarget } from "../cursor/cursor-context";
import { HERO_CLIP } from "../media";
import { PLAYABLE_DEMO_HREF, startCreatingHref } from "../routes";
import styles from "../landing.module.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * The first screen is the game: one clip, playing on loop.
 *
 * The window's `clip-path` morphs on scroll from full bleed to a stepped
 * chamfer. Stepped rather than a smooth diagonal — a 45-degree cut is the one
 * thing pixel art cannot do, so the steps are the whole point.
 */
export default function Hero({
  signedIn,
  publicPortfolioMode = false,
}: {
  signedIn: boolean;
  publicPortfolioMode?: boolean;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  const link = useCursorTarget("link");
  const play = useCursorTarget("play");

  // Scroll-driven clip-path morph.
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { clipPath: "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)" },
        {
          clipPath:
            "polygon(10% 0%, 100% 0%, 100% 84%, 94% 84%, 94% 92%, 87% 92%, 87% 100%, 0% 100%, 0% 12%, 5% 12%, 5% 6%, 10% 6%)",
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "center center",
            end: "bottom top",
            scrub: true,
            invalidateOnRefresh: true,
          },
        },
      );
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section className={`${styles.section} ${styles.hero}`} aria-labelledby="hero-title">
      <div className={styles.heroType}>
        <div className={styles.heroEyebrow}>
          <span className={styles.meta}>01 — Game production platform</span>
          <span className={`${styles.meta} ${styles.metaEmber}`}>Playable 2D world generation</span>
        </div>

        <AnimatedTitle
          as="h1"
          id="hero-title"
          className={styles.display}
          immediate
          title={"Turn ideas\ninto playable\nworlds"}
        />

        <p className={styles.lede}>
          Describe a story. We turn it into a playable 2D world, running natively in
          your browser.
        </p>

        <div className={styles.ctaRow}>
          <Magnetic strength={0.2}>
            {publicPortfolioMode ? (
              <Link className={styles.cta} href="/projects" {...link}>
                Launch Studio
                <span className={styles.ctaArrow} aria-hidden="true">
                  →
                </span>
              </Link>
            ) : signedIn ? (
              <Link className={styles.cta} href={startCreatingHref(true)} {...link}>
                Launch Studio
                <span className={styles.ctaArrow} aria-hidden="true">
                  →
                </span>
              </Link>
            ) : (
              <a className={styles.cta} href={startCreatingHref(false)} {...link}>
                Launch Studio
                <span className={styles.ctaArrow} aria-hidden="true">
                  →
                </span>
              </a>
            )}
          </Magnetic>
          <Magnetic strength={0.2}>
            <a className={styles.ctaGhost} href={PLAYABLE_DEMO_HREF} {...play}>
              Play Live Demo
            </a>
          </Magnetic>
        </div>
      </div>

      <div className={styles.heroStage}>
        <div className={styles.heroFrame} ref={frame}>
          <GameVideo clip={HERO_CLIP} controls />
          <span className={styles.frameScan} aria-hidden="true" />

          <div className={styles.heroFrameMeta}>
            <p className={styles.meta}>{HERO_CLIP.label}</p>
            <p className={`${styles.meta} ${styles.metaEmber}`}>{HERO_CLIP.kind}</p>
          </div>
        </div>

        <div className={styles.heroStageCaption}>
          <p className={styles.meta}>{HERO_CLIP.line}</p>
          <p className={styles.meta}>Generated · playing on loop</p>
        </div>
      </div>
    </section>
  );
}
