"use client";

import { useEffect } from "react";
import SmoothScroll from "./smooth-scroll";
import CursorProvider from "./cursor/cursor-provider";
import PageTransition from "./page-transition";
import Nav from "./nav";
import Hero from "./sections/hero";
import Workflow from "./sections/workflow";
import Generate from "./sections/generate";
import styles from "./landing.module.css";

/** The landing ground. Kept as literals so nothing depends on a custom property. */
const GROUND = "#090a0f";
const INK = "#f2ede4";

export default function LandingExperience({
  signedIn,
  publicPortfolioMode = false,
}: {
  signedIn: boolean;
  publicPortfolioMode?: boolean;
}) {
  /*
    Written straight onto html and body rather than expressed as a stylesheet
    rule. A selector-based version proved unreliable in the browser even though
    the rule was present and correct in the served CSS, so this removes every
    dependency on selector support, cascade order and CSS-module chunk
    boundaries. It only covers the area outside the landing container — chiefly
    overscroll — because the container paints its own ground below.

    Reverted on unmount, so the authenticated workspace keeps its paper ground
    when navigating client-side to /projects.
  */
  useEffect(() => {
    const html = document.documentElement;
    const { body } = document;
    const previous = {
      htmlBackground: html.style.backgroundColor,
      htmlColorScheme: html.style.colorScheme,
      bodyBackground: body.style.backgroundColor,
      bodyColor: body.style.color,
    };

    // `important` so the ground survives any stylesheet, including a stale
    // cached one — this has silently lost to something twice already.
    html.style.setProperty("background-color", GROUND, "important");
    html.style.setProperty("color-scheme", "dark", "important");
    body.style.setProperty("background-color", GROUND, "important");
    body.style.setProperty("color", INK, "important");

    return () => {
      html.style.removeProperty("background-color");
      html.style.removeProperty("color-scheme");
      body.style.removeProperty("background-color");
      body.style.removeProperty("color");
      // Restore anything that was set inline before we touched it.
      if (previous.htmlBackground) html.style.backgroundColor = previous.htmlBackground;
      if (previous.htmlColorScheme) html.style.colorScheme = previous.htmlColorScheme;
      if (previous.bodyBackground) body.style.backgroundColor = previous.bodyBackground;
      if (previous.bodyColor) body.style.color = previous.bodyColor;
    };
  }, []);

  return (
    <CursorProvider>
      <SmoothScroll />
      <a className={styles.skipLink} href="#main">
        Skip to content
      </a>

      <div
        className={styles.page}
        style={{ backgroundColor: GROUND, color: INK, minHeight: "100svh" }}
      >
        <Nav publicPortfolioMode={publicPortfolioMode} signedIn={signedIn} />

        <PageTransition>
          <div className={styles.shell}>
            {/* Three sections. Hero, the loop, and the thing you came to play. */}
            <main id="main">
              <Hero publicPortfolioMode={publicPortfolioMode} signedIn={signedIn} />
              <Workflow />
              <Generate publicPortfolioMode={publicPortfolioMode} signedIn={signedIn} />
            </main>

            <footer className={styles.footer}>
              <p className={styles.meta}>Game production platform</p>
              <p className={styles.meta}>Invite-only · built in public</p>
            </footer>
          </div>
        </PageTransition>
      </div>
    </CursorProvider>
  );
}
