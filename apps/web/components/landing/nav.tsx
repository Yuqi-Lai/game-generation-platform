"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useCursorTarget } from "./cursor/cursor-context";
import Magnetic from "./magnetic";
import styles from "./landing.module.css";

export default function Nav({
  signedIn,
  publicPortfolioMode = false,
}: {
  signedIn: boolean;
  publicPortfolioMode?: boolean;
}) {
  const ref = useRef<HTMLElement | null>(null);
  const link = useCursorTarget("link");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Plain scroll listener rather than a ScrollTrigger — it is one boolean.
    const onScroll = () => {
      el.dataset.lifted = String(window.scrollY > 40);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={styles.nav} ref={ref}>
      <Link className={styles.brand} href="/" {...link}>
        <span className={styles.brandMark} aria-hidden="true">
          G
        </span>
        <span className={styles.brandName}>Game Production Platform</span>
      </Link>

      <p className={styles.navMeta}>Playable 2D world generation</p>

      <div className={styles.navActions}>
        <a className={styles.navLink} href="#workflow" {...link}>
          How it works
        </a>
        <a className={styles.navLink} href="#generate" {...link}>
          Generate
        </a>
        <Magnetic strength={0.16}>
          {publicPortfolioMode ? (
            <Link className={styles.ctaGhost} href="/projects" {...link}>
              Launch Studio
              <span className={styles.ctaArrow} aria-hidden="true">
                →
              </span>
            </Link>
          ) : signedIn ? (
            <Link className={styles.ctaGhost} href="/projects" {...link}>
              Launch Studio
              <span className={styles.ctaArrow} aria-hidden="true">
                →
              </span>
            </Link>
          ) : (
            <a className={styles.ctaGhost} href="/auth/login?returnTo=/projects" {...link}>
              Sign in
              <span className={styles.ctaArrow} aria-hidden="true">
                →
              </span>
            </a>
          )}
        </Magnetic>
      </div>
    </header>
  );
}
