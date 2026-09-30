import "@testing-library/jest-dom/vitest";

/*
  jsdom does not implement `matchMedia`, and GSAP reads it inside
  `gsap.registerPlugin(ScrollTrigger)` — which runs at module-import time. Any
  test that imports a component using GSAP therefore fails during collection,
  before a single assertion runs.

  Defined here rather than per-test so it is in place before those imports, and
  guarded so a future jsdom that does implement it wins.
*/
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
