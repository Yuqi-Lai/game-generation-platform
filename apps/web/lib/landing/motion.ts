"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Media queries as an external store. `useSyncExternalStore` is the right tool
 * here: the server snapshot is always the conservative answer, so SSR renders
 * the simplified layout and the richer one is adopted on hydration without a
 * cascading render.
 */
function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True when the visitor has asked for reduced motion. */
export function useReducedMotion() {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

/**
 * True only for precise pointers on a wide viewport — the gate for the custom
 * cursor, magnetic hover and the WebGL atmosphere.
 */
export function usePointerFine() {
  return useMediaQuery("(hover: hover) and (pointer: fine) and (min-width: 1024px)");
}
