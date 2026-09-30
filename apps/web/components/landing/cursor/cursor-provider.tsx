"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CursorContext, type CursorState } from "./cursor-context";
import { usePointerFine, useReducedMotion } from "@/lib/landing/motion";
import styles from "../landing.module.css";

const RING_LAG = 0.17;
const DOT_LAG = 0.42;

/**
 * Two-element cursor: an immediate dot and a ring that trails it. The ring is
 * what carries state — it grows on links and swaps to a label on playable and
 * draggable surfaces.
 */
export default function CursorProvider({ children }: { children: React.ReactNode }) {
  const enabled = usePointerFine();
  const reduced = useReducedMotion();
  const [state, setState] = useState<CursorState>("default");
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);

  const set = useCallback((next: CursorState) => setState(next), []);
  const reset = useCallback(() => setState("default"), []);
  const api = useMemo(() => ({ set, reset, enabled }), [set, reset, enabled]);

  useEffect(() => {
    if (!enabled) return;
    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let targetX = window.innerWidth / 2;
    let targetY = window.innerHeight / 2;
    let dotX = targetX;
    let dotY = targetY;
    let ringX = targetX;
    let ringY = targetY;
    let visible = false;
    let raf = 0;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      targetX = event.clientX;
      targetY = event.clientY;
      if (!visible) {
        visible = true;
        dotX = targetX;
        dotY = targetY;
        ringX = targetX;
        ringY = targetY;
        dot.style.opacity = "1";
        ring.style.opacity = "1";
      }
    };
    const onLeave = () => {
      visible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      // Critically damped follow — no overshoot, so it never feels bouncy.
      dotX += (targetX - dotX) * (reduced ? 1 : DOT_LAG);
      dotY += (targetY - dotY) * (reduced ? 1 : DOT_LAG);
      ringX += (targetX - ringX) * (reduced ? 1 : RING_LAG);
      ringY += (targetY - ringY) * (reduced ? 1 : RING_LAG);
      dot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0) translate(-50%, -50%)`;
      ring.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) translate(-50%, -50%)`;
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [enabled, reduced]);

  // Only hide the native cursor once ours is actually running.
  useEffect(() => {
    if (!enabled) return;
    document.documentElement.classList.add(styles.cursorHidden);
    return () => document.documentElement.classList.remove(styles.cursorHidden);
  }, [enabled]);

  return (
    <CursorContext.Provider value={api}>
      {children}
      {enabled ? (
        <div className={styles.cursorLayer} aria-hidden="true">
          <div ref={dotRef} className={styles.cursorDot} data-state={state} />
          <div ref={ringRef} className={styles.cursorRing} data-state={state}>
            <span className={styles.cursorLabel}>{state === "play" ? "Play" : state === "drag" ? "Drag" : ""}</span>
          </div>
        </div>
      ) : null}
    </CursorContext.Provider>
  );
}
