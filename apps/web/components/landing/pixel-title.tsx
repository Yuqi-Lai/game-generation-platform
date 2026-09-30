"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "./landing.module.css";

gsap.registerPlugin(ScrollTrigger);

interface PixelTitleProps {
  /** Rendered as-is; pass it already cased. */
  text: string;
  as?: "h1" | "h2";
  id?: string;
}

/**
 * The section title.
 *
 * Named for the bitmap face it used to carry; it now runs in the body sans at
 * the hero's display scale, and the file name is left alone only to avoid a
 * rename rippling through imports and tests.
 *
 * One element, one text node. An earlier version stacked two layers so a hard
 * pixel extrude could sit behind a gradient fill — the extrude cannot live on
 * the gradient layer, because a `text-shadow` there paints through the
 * transparent glyphs rather than behind them. With the extrude gone that whole
 * arrangement is unnecessary, and the glow is a `filter: drop-shadow`, which
 * works on clipped gradient text because it operates on the rendered alpha.
 */
export default function PixelTitle({ text, as = "h2", id }: PixelTitleProps) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const Heading = as as React.ElementType;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.arrived = "true";
      return;
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 85%",
        once: true,
        onEnter: () => {
          el.dataset.arrived = "true";
        },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <Heading className={styles.logoTitle} id={id} ref={ref} data-arrived="false">
      {text}
    </Heading>
  );
}
