"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import styles from "./landing.module.css";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * Framer Motion handles the route handoff because this is exit choreography
 * tied to a React tree unmounting — GSAP has no equivalent of AnimatePresence,
 * and this is the one place on the page where that matters.
 *
 * Leaving for the workspace or the playable route fades and lifts the landing
 * content while a graphite mask closes over it, so the next route paints behind
 * a matching ground instead of flashing white.
 */
export default function PageTransition({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [leavingTo, setLeavingTo] = useState<string | null>(null);

  const leave = useCallback(
    (href: string) => {
      if (reduced) {
        window.location.assign(href);
        return;
      }
      setLeavingTo(href);
    },
    [reduced],
  );

  // Intercept same-origin navigations away from the landing page.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (!/^\/(projects|demo|playable|auth)/.test(href)) return;
      event.preventDefault();
      leave(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [leave]);

  // Auth and the raw Phaser route are outside the router, so use a full load
  // there. `/demo` is an ordinary Next route and navigates client-side.
  const commit = useCallback(() => {
    if (!leavingTo) return;
    if (leavingTo.startsWith("/auth") || leavingTo.startsWith("/playable")) {
      window.location.assign(leavingTo);
    } else {
      router.push(leavingTo);
    }
  }, [leavingTo, router]);

  return (
    <>
      {/*
        The content fade is plain CSS on purpose. `transform`, `filter` and
        `will-change` on an ancestor each create a containing block for
        fixed-position descendants, which would re-anchor the fixed nav to this
        wrapper and break every ScrollTrigger pin below it — pinning is
        implemented with `position: fixed`. Keeping this element free of any
        animation library's inline styles removes that hazard entirely.

        Framer Motion still drives the mask below, where presence-based
        choreography is genuinely what it is good at.
      */}
      <div className={styles.transitionHost} data-leaving={Boolean(leavingTo) && !reduced}>
        {children}
      </div>

      <AnimatePresence>
        {leavingTo && !reduced ? (
          <motion.div
            aria-hidden="true"
            initial={{ clipPath: "inset(100% 0% 0% 0%)" }}
            animate={{ clipPath: "inset(0% 0% 0% 0%)" }}
            transition={{ duration: 0.6, ease: [0.72, 0, 0.24, 1] }}
            onAnimationComplete={commit}
            style={{
              position: "fixed",
              inset: 0,
              // Matches the landing ground, so the next route continues it.
              background: "#0d0f0e",
              zIndex: 95,
              pointerEvents: "none",
            }}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
