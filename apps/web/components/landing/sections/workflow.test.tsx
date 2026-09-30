import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import Workflow from "./workflow";

afterEach(cleanup);

const css = readFileSync(join(__dirname, "..", "landing.module.css"), "utf8");
/* Comments must go first: without this the captured "selector" swallows the
   preceding comment block and never equals the bare class name. */
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Declarations of every rule whose selector list targets exactly `.name`. */
function declarationsFor(name: string) {
  return [...cssCode.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter(([, selector]) => selector.split(",").some((part) => part.trim() === `.${name}`))
    .map(([, , body]) => body)
    .join("\n");
}

const STAGES = ["Generate", "Version", "Review", "Play", "Export"];
const source = readFileSync(join(__dirname, "workflow.tsx"), "utf8");

describe("The Loop", () => {
  /*
    The point of the redesign: the whole pipeline is legible at once. An earlier
    version was a tablist that showed one stage at a time and needed a click to
    advance, which hid the process it was meant to describe.
  */
  it("shows all five stages at once, with no step hidden", () => {
    render(<Workflow />);
    const stages = screen.getAllByRole("listitem");
    expect(stages).toHaveLength(5);

    for (const [i, name] of STAGES.entries()) {
      const stage = stages[i];
      // Indicator, title and description all live on the card itself.
      expect(stage).toHaveTextContent(`0${i + 1}`);
      expect(stage).toHaveTextContent(name);
      expect(within(stage).getByRole("heading", { level: 3 })).toHaveTextContent(name);
      expect(stage.textContent!.length).toBeGreaterThan(name.length + 20);
    }
  });

  it("carries no pagination, tabs or advance control", () => {
    render(<Workflow />);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
    expect(screen.queryAllByRole("tabpanel")).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByText(/next/i)).not.toBeInTheDocument();
  });

  it("holds no interactive state at all", () => {
    // Nothing to click means nothing to remember.
    expect(source).not.toMatch(/useState/);
    expect(source).not.toMatch(/onClick/);
    expect(source).not.toMatch(/onKeyDown/);
    expect(source).not.toMatch(/aria-selected/);
  });

  it("marks the stages up as an ordered list, because they are a sequence", () => {
    render(<Workflow />);
    expect(screen.getByRole("list").tagName).toBe("OL");
  });

  /*
    The cards sit straight on the page ground. An outer chassis with its own
    label bar sealed the pipeline off from the page and, at a narrower
    max-width, crushed each card into a tall thin strip.
  */
  it("wraps the cards in nothing but the list itself", () => {
    render(<Workflow />);
    const list = screen.getByRole("list");
    // Section intro, then the list. No chassis element between them.
    expect(list.parentElement?.tagName).toBe("SECTION");

    for (const gone of ["hud", "hudStatus", "hudBadge", "hudWorld", "hudMeta", "hudScreen"]) {
      expect(source, gone).not.toMatch(new RegExp(`styles\\.${gone}\\b`));
    }
    for (const rule of ["\\.hud", "\\.hudStatus", "\\.hudScreen"]) {
      expect(cssCode).not.toMatch(new RegExp(`${rule}\\s*\\{`));
    }
  });

  it("carries no label bar text", () => {
    render(<Workflow />);
    for (const label of [/pipeline/i, /world 1/i, /stage select/i, /\bexp\b/i]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });
});

describe("The Loop's pipeline styling", () => {
  it("lays the five stages out in one horizontal row on desktop", () => {
    const pipeline = declarationsFor("pipeline");
    // Stacked below 900px; five columns above it.
    expect(pipeline).toMatch(/grid-template-columns:\s*1fr/);
    const desktop = /@media \(min-width: 900px\) \{\s*\.pipeline \{([^}]*)\}/.exec(cssCode)?.[1];
    expect(desktop).toMatch(/grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
  });

  it("connects the cards with a dashed run and a light arrow", () => {
    // Down when stacked, right when in a row.
    expect(cssCode).toMatch(/\.stage\[data-flows="true"\]::after \{[^}]*content:\s*"↓"/);
    expect(cssCode).toMatch(/content:\s*"→"/);
    expect(cssCode).toMatch(/\.stage\[data-flows="true"\]::before \{[^}]*repeating-linear-gradient/);
    // The run spans the gap exactly, so it meets both cards.
    expect(cssCode).toMatch(/width:\s*var\(--stage-gap\)/);
  });

  it("puts no surface behind the row, only on the cards", () => {
    const pipeline = declarationsFor("pipeline");
    expect(pipeline).not.toMatch(/background/);
    expect(pipeline).not.toMatch(/border/);
    expect(pipeline).not.toMatch(/box-shadow/);
  });

  it("gives each card a faint translucent surface and a hairline edge", () => {
    const stage = declarationsFor("stage");
    // Translucent, so the page ground reads through it.
    expect(stage).toMatch(/background-color:\s*rgb\(20 23 32 \/ 55%\)/);
    expect(stage).toMatch(/border:\s*1px solid rgb\(242 237 228 \/ 9%\)/);
    expect(stage).not.toMatch(/border-radius/);
    // Room for the copy to breathe rather than a narrow strip.
    expect(stage).toMatch(/padding:\s*clamp\(1\.15rem/);
    // The neon edge is a hover state, not a resting glow.
    expect(declarationsFor("stage:hover")).toMatch(/border-color:\s*rgb\(55 224 255/);
  });

  it("leaves a real gap between the cards", () => {
    const pipeline = declarationsFor("pipeline");
    expect(pipeline).toMatch(/--stage-gap:\s*clamp\(1rem, 2\.4vw, 2\.25rem\)/);
    expect(pipeline).toMatch(/gap:\s*var\(--stage-gap\)/);
  });

  it("renders the badges and titles in the bitmap face", () => {
    for (const name of ["stageBadge", "stageName", "stageReward"]) {
      expect(declarationsFor(name), `.${name}`).toMatch(/font-family:\s*var\(--type-pixel\)/);
    }
  });

  it("keeps the descriptions in the readable sans face", () => {
    expect(declarationsFor("stageBody")).not.toMatch(/--type-pixel/);
  });

  it("steps its transitions rather than easing them smoothly", () => {
    expect(declarationsFor("stage")).toMatch(/steps\(1, end\)/);
    expect(cssCode).toMatch(/@keyframes\s+stageArrive/);
  });
});
