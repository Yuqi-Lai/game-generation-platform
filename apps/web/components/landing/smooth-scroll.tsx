"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "@/lib/landing/motion";

gsap.registerPlugin(ScrollTrigger);

/**
 * Lenis driven by GSAP's ticker so ScrollTrigger and the smooth scroll share a
 * single clock — without this, pinned sections jitter against the inertia.
 *
 * lerp 0.085 is weighted but still tracks the wheel closely; anything lower
 * starts to feel floaty and detached from the input.
 */
export default function SmoothScroll() {
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      // Native scrolling only. ScrollTrigger still runs so reveals land, but
      // every sequence is authored to snap to its end state when reduced.
      ScrollTrigger.refresh();
      let done = false;
      document.fonts.ready.then(() => {
        if (!done) ScrollTrigger.refresh();
      });
      return () => {
        done = true;
      };
    }

    const lenis = new Lenis({
      lerp: 0.085,
      wheelMultiplier: 1,
      smoothWheel: true,
      // Never hijack touch — native momentum is better than anything we fake.
      syncTouch: false,
    });

    const onScroll = () => ScrollTrigger.update();
    lenis.on("scroll", onScroll);

    const raf = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);

    // Keep in-page anchors working with the virtual scroll.
    const onAnchorClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement)?.closest?.('a[href^="#"]');
      if (!anchor) return;
      const id = anchor.getAttribute("href")!.slice(1);
      const target = id && document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      lenis.scrollTo(target, { offset: 0, duration: 1.1 });
    };
    document.addEventListener("click", onAnchorClick);

    /*
      Pinned sections measure their start/end on creation. Two things change
      section heights afterwards: web fonts swapping in, and SplitText
      re-splitting headlines once `document.fonts.ready` resolves. Without a
      refresh on both, every pin is anchored to stale geometry.
    */
    ScrollTrigger.refresh();
    let cancelled = false;
    document.fonts.ready.then(() => {
      if (!cancelled) ScrollTrigger.refresh();
    });
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener("load", onLoad);

    return () => {
      cancelled = true;
      window.removeEventListener("load", onLoad);
      document.removeEventListener("click", onAnchorClick);
      lenis.off("scroll", onScroll);
      gsap.ticker.remove(raf);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
    };
  }, [reduced]);

  return null;
}
