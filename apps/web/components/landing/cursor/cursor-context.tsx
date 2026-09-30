"use client";

import { createContext, useContext } from "react";

export type CursorState = "default" | "link" | "play" | "drag";

interface CursorApi {
  set: (state: CursorState) => void;
  reset: () => void;
  enabled: boolean;
}

export const CursorContext = createContext<CursorApi>({
  set: () => {},
  reset: () => {},
  enabled: false,
});

export function useCursor() {
  return useContext(CursorContext);
}

/**
 * Attach to any element that should change the cursor while hovered.
 * Pointer events (not mouse) so a stylus behaves, and focus is left alone —
 * keyboard users get the native focus ring instead.
 */
export function useCursorTarget(state: CursorState) {
  const { set, reset } = useCursor();
  return {
    onPointerEnter: () => set(state),
    onPointerLeave: () => reset(),
  };
}
