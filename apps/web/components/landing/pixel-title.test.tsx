import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PixelTitle from "./pixel-title";

afterEach(cleanup);

const css = readFileSync(join(__dirname, "landing.module.css"), "utf8");
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, "");

function declarationsFor(name: string) {
  return [...cssCode.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
    .filter(([, list]) => list.split(",").some((part) => part.trim() === `.${name}`))
    .map(([, , body]) => body)
    .join("\n");
}

describe("PixelTitle", () => {
  it("renders one heading holding one text node", () => {
    const { container } = render(<PixelTitle as="h2" id="generate-title" text="BUILD YOUR GAME" />);
    const heading = screen.getByRole("heading", { level: 2 });

    expect(heading).toHaveAttribute("id", "generate-title");
    expect(heading).toHaveAccessibleName("BUILD YOUR GAME");
    // The two-layer stack is gone with the extrude it existed for.
    expect(container.querySelectorAll("span")).toHaveLength(0);
    expect(heading.childElementCount).toBe(0);
  });

  it("carries no decorative badge", () => {
    render(<PixelTitle text="BUILD YOUR GAME" />);
    expect(screen.queryByText(/16-bit/i)).not.toBeInTheDocument();
    const source = readFileSync(join(__dirname, "pixel-title.tsx"), "utf8");
    expect(source).not.toMatch(/logoTag|logoSpark/);
  });
});

describe("PixelTitle styling", () => {
  const title = declarationsFor("logoTitle");

  it("shares the hero's face and weight, not the small-label bitmap one", () => {
    expect(title).toMatch(/font-family:\s*var\(--type-sans\)/);
    expect(title).not.toMatch(/--type-pixel/);
    expect(title).toMatch(/font-weight:\s*500/);

    /*
      `.page` sets `font-synthesis-weight: none`, so a weight the face does not
      ship renders at the nearest one it does rather than being faked. 500 has
      to be in Inter's loaded set.
    */
    const layout = readFileSync(join(__dirname, "..", "..", "app", "layout.tsx"), "utf8");
    const weights = /const sans = Inter\(\{[\s\S]*?weight: \[([^\]]*)\]/.exec(layout)?.[1] ?? "";
    expect(weights).toMatch(/"500"/);

    /*
      The pixel display face is gone with the wordmark that used it. Nothing
      should still load it, or the page pays for a font it never paints.
    */
    expect(layout).not.toMatch(/Handjet|--font-display/);
    const css = readFileSync(join(__dirname, "landing.module.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/--font-display/);
  });

  it("matches the scale section 01's own title is set at", () => {
    // Same clamp, weight and leading as `.displayLarge`, so the two read as
    // siblings rather than as a logo next to a heading.
    const hero = declarationsFor("displayLarge");
    for (const property of ["font-size", "font-weight", "line-height"]) {
      const from = (decls: string) =>
        new RegExp(`${property}:\\s*([^;]+)`).exec(decls)?.[1]?.trim();
      expect(from(title), property).toBe(from(hero));
    }
  });

  /*
    No outline at all now. `-webkit-text-stroke` anti-aliases, which rounds the
    corners off a pixel face — the one thing this font is chosen for. The hard
    zero-blur offset in `filter` does the separating instead.

    It has to stay a `filter`, not a `text-shadow`: the glyphs are transparent
    under the clipped gradient, so a text-shadow paints straight through them.
  */
  it("carries no smoothed outline, only a hard pixel offset", () => {
    expect(title).not.toMatch(/-webkit-text-stroke/);
    expect(title).not.toMatch(/paint-order/);
    expect(title).not.toMatch(/text-shadow/);
    expect(cssCode).not.toMatch(/\.logoExtrude/);
    // Zero blur, or it stops reading as a pixel step.
    expect(title).toMatch(/drop-shadow\(0 2px 0 #04070d\)/);
  });

  it("sinks with one hard shadow and one faint white mist, not a stack", () => {
    const shadows = [...title.matchAll(/drop-shadow\(/g)];
    expect(shadows).toHaveLength(2);
    // A fixed 2px sink, per the agreed weight, and no warm glow left over.
    expect(title).toMatch(/drop-shadow\(0 2px 0 #04070d\)/);
    expect(title).toMatch(/drop-shadow\(0 0 12px rgb\(255 255 255 \/ 20%\)\)/);
    // No colour left anywhere in the glow — monochrome is the point.
    expect(title).not.toMatch(/245 158 11|34 211 238/);
  });

  /*
    `filter`, not `text-shadow`: drop-shadow works on the rendered alpha so it
    glows the clipped gradient, where a text-shadow paints through the
    transparent fill instead of behind it.
  */
  it("glows with a filter so it survives the clipped gradient", () => {
    expect(title).toMatch(/filter:\s*drop-shadow/);
  });

  /*
    Monochrome silver, asked for directly: pure white into a low-saturation
    blue-grey. An earlier revision capped the highlight below pure white
    because it read harsh; that ceiling was lifted on request, so what remains
    below is the AA floor rather than a brightness preference.
  */
  it("fills pure white into low-saturation silver, with no hue between", () => {
    expect(title).toMatch(/linear-gradient\(\s*180deg/);
    expect(title).toMatch(/#ffffff 0%/);    // pure white highlight
    expect(title).toMatch(/#cbd5e1 78%/);   // silver
    expect(title).toMatch(/#94a3b8 100%/);  // cool blue-grey base
    // Every prior ramp is gone: gold, the rejected cyber blue, and the cyan.
    expect(title).not.toMatch(/#f7c948|#d97706|#f59e0b|#ffe9a8/);
    expect(title).not.toMatch(/#00f2fe|#4facfe/);
    expect(title).not.toMatch(/#f0fdfa|#22d3ee|#06b6d4|#67e8f9|#cffafe/);
    expect(title).not.toMatch(/repeating-linear-gradient/);
  });

  /*
    The base used to end in a dark emerald, which read as dull rather than
    metallic. Every stop must stay bright.
  */
  it("never ends on a dark stop", () => {
    const luminance = (hex: string) => {
      const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = parts.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const stops = [...title.matchAll(/#([0-9a-f]{6})\s+\d+%/g)].map((m) => `#${m[1]}`);
    expect(stops.length).toBeGreaterThanOrEqual(4);
    for (const stop of stops) {
      expect(luminance(stop), `${stop} is too dark for a metal fill`).toBeGreaterThan(0.15);
    }
  });

  it("keeps every gradient stop legible on the ground", () => {
    const luminance = (hex: string) => {
      const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = parts.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    const stops = [...title.matchAll(/#([0-9a-f]{6})\s+\d+%/g)].map((m) => `#${m[1]}`);
    expect(stops.length).toBeGreaterThanOrEqual(3);
    /*
      Only the AA floor is enforced now. The old ceiling — every stop softer
      than pure white — encoded a preference that was later overridden by an
      explicit request for a #ffffff highlight, so asserting it would just
      block the agreed design. The ramp still has to descend, which is what
      keeps the highlight to the top edge.
    */
    for (const stop of stops) {
      expect(contrast(stop, "#090a0f"), stop).toBeGreaterThanOrEqual(4.5);
    }
    const ramp = stops.map((stop) => luminance(stop));
    expect(ramp, "the ramp must run bright to dim, not back up").toEqual(
      [...ramp].sort((a, b) => b - a),
    );
  });

  it("tracks the wordmark as tightly as the hero title", () => {
    /*
      The hero sits at -0.04em. This is all caps, which needs a little less
      negative tracking than lowercase before the letters start to touch, so
      it stops at -0.03em. The 2px the pixel face wanted is gone: a positive
      fixed gap on a proportional face just looks loose.
    */
    expect(title).toMatch(/letter-spacing:\s*-0\.03em/);
    expect(title).not.toMatch(/letter-spacing:\s*\d+px/);
    expect(declarationsFor("displayLarge")).toMatch(/letter-spacing:\s*-0\.04em/);
    // Nothing extra between the three words.
    expect(title).toMatch(/word-spacing:\s*0;/);
  });

  it("holds the agreed scale and is allowed to wrap", () => {
    expect(title).toMatch(/font-size:\s*clamp\(2\.2rem, 5\.6vw, 5rem\)/);
    /*
      "BUILD YOUR GAME" is 8.91em in this face — three times the eight-glyph
      pixel wordmark it replaced. At this clamp one line needs 298px inside
      280px on a 320px viewport, so `nowrap` would overflow the page instead.
      The hero title wraps too.
    */
    expect(title).not.toMatch(/white-space:\s*nowrap/);
    expect(title).toMatch(/text-wrap:\s*balance/);
  });

  /*
    Now that the title may wrap, the thing that can still overflow is a single
    unbreakable word. So the constraint moved: the widest word has to fit the
    column at every viewport, and the whole line has to fit at the desktop end
    where it is expected to sit on one line.

    The em widths are measured from the font, not estimated: Inter 500 at 2816
    unitsPerEm gives "GAME" 2.864em and the full "BUILD YOUR GAME" 8.910em. An
    early version of this test guessed per-glyph widths and understated them by
    28%, which would have passed a size that overflowed.

    Tracking is read out of the stylesheet rather than folded into the
    constant, so the sum stays correct whether it is set in em or px.
  */
  it("fits its column at every viewport width", () => {
    const WIDEST_WORD = { text: "GAME", em: 2.8643 };
    const FULL_LINE = { text: "BUILD YOUR GAME", em: 8.9102 };

    const clamp = /font-size:\s*clamp\(([\d.]+)rem,\s*([\d.]+)vw,\s*([\d.]+)rem\)/.exec(title);
    expect(clamp, "font-size is not a three-stop clamp").toBeTruthy();
    const [minRem, vwCoefficient, maxRem] = clamp!.slice(1).map(Number);

    /* Resolves a length that may be px or em against the current font size. */
    const lengthPx = (property: string, atSize: number) => {
      const found = new RegExp(`${property}:\\s*(-?[\\d.]+)(px|em)?`).exec(title);
      if (!found) return 0;
      const value = Number(found[1]);
      if (value === 0) return 0;
      expect(found[2], `${property} needs a px or em unit to be measurable`).toBeTruthy();
      return found[2] === "em" ? value * atSize : value;
    };

    const columnPx = Number(/max-width:\s*(\d+)px/.exec(declarationsFor("generateInner"))?.[1]);
    expect(columnPx).toBeGreaterThan(0);

    // .section's gutter: clamp(1.25rem, 4.5vw, 5.5rem), one each side.
    const gutter = (viewport: number) => Math.max(20, Math.min(viewport * 0.045, 88));

    const widthOf = (piece: { text: string; em: number }, size: number) =>
      piece.em * size +
      lengthPx("letter-spacing", size) * piece.text.length +
      lengthPx("word-spacing", size) * (piece.text.split(" ").length - 1);

    for (let viewport = 320; viewport <= 2560; viewport += 8) {
      const size = Math.max(minRem * 16, Math.min((viewport * vwCoefficient) / 100, maxRem * 16));
      const available = Math.min(columnPx, viewport - 2 * gutter(viewport));
      expect(
        widthOf(WIDEST_WORD, size) / available,
        `"${WIDEST_WORD.text}" cannot wrap, and overflows at ${viewport}px`,
      ).toBeLessThanOrEqual(0.92);
    }

    // And one line at the desktop end, which is where it is meant to sit.
    const atMax = maxRem * 16;
    expect(widthOf(FULL_LINE, atMax) / columnPx, "wraps at the widest column")
      .toBeLessThanOrEqual(0.92);
  });

  /*
    The container's row gap is shared by every child, so widening it would also
    push the label above the crest away. The extra space belongs on the title.
  */
  it("leaves breathing room between the crest and the prompt box", () => {
    expect(title).toMatch(/margin:\s*0 0 clamp\(0\.75rem, 2vw, 1\.75rem\)/);
    // Still on top of the container's own gap, not replacing it.
    expect(declarationsFor("generateInner")).toMatch(/gap:\s*clamp\(/);
  });

  it("keeps the prompt box at its own width despite the wider column", () => {
    expect(declarationsFor("promptBox")).toMatch(/max-width:\s*780px/);
    expect(declarationsFor("generateInner")).toMatch(/max-width:\s*1000px/);
  });

  it("stays legible if background-clip: text is unsupported", () => {
    expect(title).toMatch(/color:\s*#cbd5e1/);
    expect(cssCode).toMatch(/@supports not \(\(background-clip: text\)/);
  });

  it("settles in stepped, and not at all under reduced motion", () => {
    expect(cssCode).toMatch(/@keyframes\s+logoPop/);
    expect(cssCode).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?logoPop/);
  });
});
