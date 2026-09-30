"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import styles from "./landing.module.css";

gsap.registerPlugin(ScrollTrigger);

interface AnimatedTitleProps {
  /** Use "\n" to force a line break. */
  title: string;
  as?: "h1" | "h2" | "h3";
  id?: string;
  className?: string;
  /** Play immediately instead of on scroll. For the hero only. */
  immediate?: boolean;
}

/**
 * Word-by-word 3D reveal: each word swings up out of the page on its own
 * slightly different axis, with a tight stagger so the line assembles rather
 * than marching in.
 *
 * Reverses on scroll-up, so scrubbing back and forth never leaves it half-built.
 */
export default function AnimatedTitle({
  title,
  as = "h2",
  id,
  className,
  immediate = false,
}: AnimatedTitleProps) {
  const root = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.querySelectorAll<HTMLElement>(`.${styles.animatedWord}`).forEach((word) => {
        word.style.opacity = "1";
        word.style.transform = "none";
      });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.to(`.${styles.animatedWord}`, {
        opacity: 1,
        transform: "translate3d(0, 0, 0) rotateY(0deg) rotateX(0deg)",
        duration: 0.9,
        ease: "power2.inOut",
        stagger: 0.03,
        ...(immediate
          ? { delay: 0.25 }
          : {
              scrollTrigger: {
                trigger: el,
                start: "100 bottom",
                end: "center bottom",
                toggleActions: "play none none reverse",
              },
            }),
      });
    }, el);

    return () => ctx.revert();
  }, [immediate]);

  const Tag = as as React.ElementType;

  return (
    <Tag ref={root} id={id} className={`${styles.animatedTitle} ${className ?? ""}`}>
      {title.split("\n").map((line, lineIndex) => (
        <span className={styles.animatedLine} key={lineIndex}>
          {line.split(" ").map((word, wordIndex) => (
            <span
              className={styles.animatedWord}
              key={wordIndex}
              dangerouslySetInnerHTML={{ __html: word }}
            />
          ))}
        </span>
      ))}
    </Tag>
  );
}
