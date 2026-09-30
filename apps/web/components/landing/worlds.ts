/**
 * World definitions for the showcase.
 *
 * Every world is painted procedurally by `world-paint.ts` from the seed below —
 * there are no image assets. Each carries a place name and a single written
 * line; deliberately no generation parameters, job ids or asset counts. This is
 * a page for people who want to make and play games.
 */

export interface WorldPalette {
  /** Banded sky, back to front. Also drives the ambient bloom behind the stage. */
  sky: [string, string, string];
  far: string;
  mid: string;
  ground: string;
  groundDeep: string;
  accent: string;
  accentAlt: string;
  ink: string;
}

export interface World {
  id: string;
  /** Editorial index, e.g. "01". */
  index: string;
  /** Oversized display name. */
  name: string;
  /** Art direction, two or three words. */
  kind: string;
  /** A place in the world, not a parameter. */
  region: string;
  /** One written line. Never marketing copy, never a spec. */
  line: string;
  /** Hex seed, used only by the painter. */
  seed: string;
  palette: WorldPalette;
}

export const WORLDS: World[] = [
  {
    id: "tideglass-farm",
    index: "01",
    name: "Tideglass Farm",
    kind: "Pixel RPG",
    region: "The coast road, first thaw",
    line: "Eight tilled rows, a saltwater well, and a harvest that has to clear before the tide turns.",
    seed: "0x2B7E04",
    palette: {
      sky: ["#20364a", "#3d5f73", "#e7c79c"],
      far: "#4a5f63",
      mid: "#4a6b3e",
      ground: "#6b5336",
      groundDeep: "#3f2f1e",
      accent: "#e8b055",
      accentAlt: "#7fc06a",
      ink: "#f2ecda",
    },
  },
  {
    id: "ashen-hollow",
    index: "02",
    name: "Ashen Hollow",
    kind: "Dark fantasy",
    region: "The drowned cloister",
    line: "Fog that keeps the shape of whatever walked through it last, and a bell no one will answer.",
    seed: "0x8C11D4",
    palette: {
      sky: ["#15131a", "#211d28", "#322b38"],
      far: "#2b2530",
      mid: "#1c1822",
      ground: "#141118",
      groundDeep: "#0b090d",
      accent: "#c8512f",
      accentAlt: "#9d8ec0",
      ink: "#e4dcd3",
    },
  },
  {
    id: "neon-sector",
    index: "03",
    name: "Neon Sector",
    kind: "Cyberpunk",
    region: "Lower tier, block 9",
    line: "Eleven storeys of service corridor, lit entirely by things that are trying to sell you something.",
    seed: "0x4F2A91",
    palette: {
      sky: ["#120e1d", "#1b1430", "#2a1a3f"],
      far: "#231a3a",
      mid: "#171029",
      ground: "#100b1c",
      groundDeep: "#080510",
      accent: "#ff4d8d",
      accentAlt: "#37e0ff",
      ink: "#e9e2ff",
    },
  },
  {
    id: "linen-fable",
    index: "04",
    name: "Linen Fable",
    kind: "Painterly storybook",
    region: "Hill country, late afternoon",
    line: "Soft-edged hills with no grid at all, painted as though the whole map were a single wash.",
    seed: "0x6D3F58",
    palette: {
      sky: ["#232026", "#3b3239", "#5c4a4a"],
      far: "#6d565a",
      mid: "#4b3b41",
      ground: "#33272d",
      groundDeep: "#1e1720",
      accent: "#e8a08a",
      accentAlt: "#87a8a2",
      ink: "#f6ece4",
    },
  },
  {
    id: "orbital-drift",
    index: "05",
    name: "Orbital Drift",
    kind: "Sci-fi",
    region: "Maintenance ring, spinward",
    line: "A station turning slowly enough that the hazard lighting reads as a heartbeat.",
    seed: "0x1A55E7",
    palette: {
      sky: ["#0b0f14", "#111820", "#1a242e"],
      far: "#1d2a35",
      mid: "#131b23",
      ground: "#0d1318",
      groundDeep: "#06090c",
      accent: "#f0a12e",
      accentAlt: "#5fd2e0",
      ink: "#dfe8ef",
    },
  },
];

/** The farm leads: it is the friendliest read and the demo world. */
export const HERO_WORLD = WORLDS[0];
