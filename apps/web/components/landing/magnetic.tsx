"use client";

import { useEffect, useRef } from "react";
import { usePointerFine, useReducedMotion } from "@/lib/landing/motion";

interface MagneticProps {
  children: React.ReactElement;
  /** Fraction of the cursor offset the element travels. Keep it small. */
  strength?: number;
  /** Extra hit radius around the element, in px. */
  radius?: number;
}

/**
 * Subtle magnetic attraction. The element drifts a fraction of the distance to
 * the cursor with a damped follow, and settles back on exit. Wraps a single
 * child and animates it via a wrapping span so the child keeps its own styles.
 */
export default function Magnetic({ children, strength = 0.22, radius = 64 }: MagneticProps) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const fine = usePointerFine();
  const reduced = useReducedMotion();

  useEffect(() => {
    const host = ref.current;
    if (!host || !fine || reduced) return;
    const target = host.firstElementChild as HTMLElement | null;
    if (!target) return;

    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let settled = true;

    const onMove = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      const rect = host.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const within =
        event.clientX > rect.left - radius &&
        event.clientX < rect.right + radius &&
        event.clientY > rect.top - radius &&
        event.clientY < rect.bottom + radius;
      tx = within ? (event.clientX - cx) * strength : 0;
      ty = within ? (event.clientY - cy) * strength : 0;
      if (settled) {
        settled = false;
        raf = requestAnimationFrame(tick);
      }
    };

    const tick = () => {
      x += (tx - x) * 0.14;
      y += (ty - y) * 0.14;
      target.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      // Park the loop once the spring has arrived, wherever that is — otherwise
      // a cursor resting inside the hit area keeps a rAF alive per element.
      if (Math.abs(tx - x) < 0.05 && Math.abs(ty - y) < 0.05) {
        x = tx;
        y = ty;
        target.style.transform = tx === 0 && ty === 0 ? "" : `translate3d(${tx}px, ${ty}px, 0)`;
        settled = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
      target.style.transform = "";
    };
  }, [fine, reduced, strength, radius]);

  return <span ref={ref} style={{ display: "inline-flex" }}>{children}</span>;
}
