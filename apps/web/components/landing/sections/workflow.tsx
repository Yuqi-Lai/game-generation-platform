"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import AnimatedTitle from "../animated-title";
import styles from "../landing.module.css";

gsap.registerPlugin(ScrollTrigger);

/**
 * The five stages of the loop. Each one yields an artifact, which is what
 * `reward` names.
 */
const STAGES = [
  {
    stage: "01",
    name: "Generate",
    reward: "A world",
    body: "Say what the place is. It comes back drawn, tiled and populated.",
  },
  {
    stage: "02",
    name: "Version",
    reward: "A snapshot",
    body: "Every run is kept. Nothing overwrites the one you liked last week.",
  },
  {
    stage: "03",
    name: "Review",
    reward: "An approval",
    body: "Send a world round. Collect the yes, or the note about the sky.",
  },
  {
    stage: "04",
    name: "Play",
    reward: "A runtime",
    body: "Walk it in the browser. If it is not fun here, it will not be fun shipped.",
  },
  {
    stage: "05",
    name: "Export",
    reward: "A content pack",
    body: "Take the whole thing as one pack your game can load.",
  },
] as const;

/**
 * The production loop as a static five-stage pipeline.
 *
 * Deliberately not interactive. An earlier version was a tablist inside an
 * arcade cabinet, which meant clicking through the stages one at a time and
 * never seeing the whole process at once — the opposite of what a pipeline
 * diagram is for. Every stage is now on screen together, so there is no state
 * here at all: just five cards and one scroll-triggered arrival.
 */
export default function Workflow() {
  const pipeline = useRef<HTMLOListElement | null>(null);

  // The stages arrive along the line rather than all at once.
  useEffect(() => {
    const el = pipeline.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.arrived = "true";
      return;
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: el,
        start: "top 82%",
        once: true,
        onEnter: () => {
          el.dataset.arrived = "true";
        },
      });
    }, el);
    return () => ctx.revert();
  }, []);

  return (
    <section
      className={`${styles.section} ${styles.workflow}`}
      id="workflow"
      aria-labelledby="workflow-title"
    >
      <div className={styles.sectionIntro}>
        <p className={styles.meta}>02 — The loop</p>
        <AnimatedTitle
          as="h2"
          id="workflow-title"
          className={styles.displayLarge}
          title={"Make it, keep it,\nplay it, ship it"}
        />
      </div>

      {/*
        No outer container: the cards sit straight on the page ground. An
        earlier version boxed them in a dark chassis with its own label bar,
        which sealed the pipeline off from the page and squeezed every card
        into a narrow strip.
      */}
      <ol className={styles.pipeline} ref={pipeline} data-arrived="false">
        {STAGES.map((item, i) => (
          <li
            className={styles.stage}
            key={item.stage}
            style={{ ["--node-index" as string]: i }}
            /* The arrow into the next stage; nothing after the last one. */
            data-flows={i < STAGES.length - 1}
          >
            <div className={styles.stageHead}>
              <span className={styles.stageBadge}>{item.stage}</span>
              <span className={styles.stageMarker} aria-hidden="true" />
            </div>
            <h3 className={styles.stageName}>{item.name}</h3>
            <p className={styles.stageBody}>{item.body}</p>
            <p className={styles.stageReward}>{item.reward}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
