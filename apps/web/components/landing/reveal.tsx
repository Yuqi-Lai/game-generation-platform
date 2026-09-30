"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "./landing.module.css";

gsap.registerPlugin(ScrollTrigger);

type As = "div" | "section" | "p" | "span" | "li" | "ul" | "header" | "footer" | "figure";

interface RevealProps extends React.HTMLAttributes<HTMLElement> {
  as?: As;
  /** Seconds of delay before this element's reveal. */
  delay?: number;
  /** Stagger direct children instead of revealing the element as one block. */
  stagger?: number;
  /** Vertical travel, px. */
  y?: number;
  children?: React.ReactNode;
}

/**
 * The single shared reveal used everywhere except the three authored sequences.
 * Deliberately one primitive with one easing and one duration, so the page has
 * a consistent motion signature instead of a dozen bespoke entrances.
 */
export default function Reveal({
  as = "div",
  delay = 0,
  stagger,
  y = 26,
  children,
  className,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.opacity = "1";
      Array.from(el.children).forEach((c) => ((c as HTMLElement).style.opacity = "1"));
      return;
    }

    // With a stagger the children are the animated targets, so the host itself
    // has to be taken out of its own hidden start state.
    const targets = stagger ? Array.from(el.children) : [el];
    if (stagger) el.style.opacity = "1";

    const ctx = gsap.context(() => {
      gsap.fromTo(
        targets,
        { opacity: 0, y, filter: "blur(6px)" },
        {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          duration: 0.9,
          delay,
          stagger: stagger ?? 0,
          ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 88%", once: true },
        },
      );
    }, el);
    return () => ctx.revert();
  }, [delay, stagger, y]);

  const Tag = as as React.ElementType;
  return (
    <Tag ref={ref} className={`${styles.reveal} ${className ?? ""}`} {...rest}>
      {children}
    </Tag>
  );
}
