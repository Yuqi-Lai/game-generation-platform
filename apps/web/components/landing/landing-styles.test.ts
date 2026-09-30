import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "landing.module.css"), "utf8");
const globals = readFileSync(join(__dirname, "..", "..", "app", "globals.css"), "utf8");
const experience = readFileSync(join(__dirname, "landing-experience.tsx"), "utf8");
/** Comments explain what we deliberately avoid, so code-only for those checks. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
/** The page is exactly three sections. */
const SECTION_FILES = ["hero", "workflow", "generate"];
const sections = SECTION_FILES.map((name) =>
  readFileSync(join(__dirname, "sections", `${name}.tsx`), "utf8"),
);

interface Rule {
  selector: string;
  body: string;
}

/** Brace-depth scanner, so rules nested in @media are found too. */
function parse(source: string): Rule[] {
  const out: Rule[] = [];
  const scan = (text: string) => {
    let depth = 0;
    let selectorStart = 0;
    let braceStart = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === "{") {
        if (depth === 0) braceStart = i;
        depth++;
      } else if (text[i] === "}") {
        depth--;
        if (depth === 0) {
          const selector = text.slice(selectorStart, braceStart).trim();
          const body = text.slice(braceStart + 1, i);
          if (selector.startsWith("@")) scan(body);
          else out.push({ selector, body });
          selectorStart = i + 1;
        }
      }
    }
  };
  scan(source.replace(/\/\*[\s\S]*?\*\//g, ""));
  return out;
}

const RULES = parse(css);

/** Every declaration block whose selector list targets exactly `.name`. */
function declarationsFor(name: string) {
  const matched = RULES.filter((rule) =>
    rule.selector.split(",").some((part) => part.trim() === `.${name}`),
  );
  return matched.map((rule) => rule.body).join("\n");
}

describe("landing stylesheet invariants", () => {
  /*
    Pinning is gone. It repeatedly produced overlapping, detached layout, so
    every section is now an ordinary grid in normal flow and the only
    scroll-driven motion is a scrubbed transform. These two tests keep it that
    way.
  */
  it("uses no ScrollTrigger pinning anywhere", () => {
    for (const source of sections) {
      expect(source).not.toMatch(/\bpin\s*:/);
      expect(source).not.toMatch(/pinSpacing|anticipatePin/);
    }
  });

  it("keeps the scroll container free of overflow", () => {
    for (const name of ["page", "shell", "transitionHost"]) {
      const decls = declarationsFor(name);
      expect(decls, `no rule found for .${name}`).not.toHaveLength(0);
      expect(decls).not.toMatch(/(^|[\s;])overflow(-x|-y)?\s*:/);
    }
  });

  it("renders exactly three sections, in order", () => {
    const experienceMain = /<main id="main">([\s\S]*?)<\/main>/.exec(experience)?.[1] ?? "";
    const rendered = [...experienceMain.matchAll(/<([A-Z][A-Za-z]*)/g)].map((m) => m[1]);
    expect(rendered).toEqual(["Hero", "Workflow", "Generate"]);
  });

  /*
    The field carries prose, so it runs in the body sans while the label above
    it stays on the bitmap face. Both halves of that contrast are asserted
    here: a regression in either direction is a real change in intent.

    The placeholder is pinned alongside the field because `::placeholder` does
    not reliably inherit a changed font in every engine.
  */
  it("renders the prompt field in the body sans, and its label in the bitmap face", () => {
    for (const rule of ["promptInput", "promptInput::placeholder"]) {
      const decls = declarationsFor(rule);
      expect(decls, rule).toMatch(/font-family:\s*var\(--type-sans\)/);
      expect(decls, rule).not.toMatch(/--type-pixel/);
      // The bitmap face's wide leading and tracking come back in.
      expect(decls, rule).toMatch(/letter-spacing:\s*0\.01em/);
      expect(decls, rule).toMatch(/line-height:\s*1\.8/);
    }
    // The label is chrome, and stays on the bitmap face.
    expect(declarationsFor("promptLabel")).toMatch(/font-family:\s*var\(--type-pixel\)/);
  });

  it("sizes the field below the face it replaced", () => {
    /*
      Inter's x-height is 0.546em against Silkscreen's 0.500em, so matching px
      would have read larger, not smaller. 13px of Inter gives a 7.1px
      x-height against the outgoing 15px of Silkscreen's 7.5px.
    */
    const size = /font-size:\s*clamp\(([^)]*)\)/.exec(declarationsFor("promptInput"))?.[1];
    expect(size).toBe("0.75rem, 0.95vw, 0.8125rem");
  });

  it("keeps the field at 16px on touch, so iOS does not zoom the page on focus", () => {
    /*
      Safari on iOS zooms the viewport when a focused input computes under
      16px. The field is deliberately smaller than that on pointer devices, so
      the opt-out has to exist or tapping the page's main input jerks the
      layout.
    */
    const css = readFileSync(join(__dirname, "landing.module.css"), "utf8");
    const block = /@media \(pointer: coarse\) \{([\s\S]*?)\n\}/.exec(css);
    expect(block, "no (pointer: coarse) block").toBeTruthy();
    expect(block![1]).toMatch(/promptInput/);
    expect(block![1]).toMatch(/font-size:\s*1rem/);
  });

  it("keeps the bitmap label inside Silkscreen's charset", () => {
    /*
      The field is free of this now, but the label above it is still Silkscreen
      and a glyph the face lacks falls back to the sans mid-phrase.
    */
    const generate = readFileSync(join(__dirname, "sections", "generate.tsx"), "utf8");
    const label = /htmlFor="prompt">\s*([^<]+)/.exec(generate)?.[1]?.trim() ?? "";
    expect(label).toBeTruthy();
    expect(label).not.toMatch(/[\u2018\u2019\u201c\u201d\u2013\u2014\u2026]/);
  });

  /*
    The prompt box is a real <form> with a labelled control, so Enter submits
    and the field is reachable and announced. A div-and-click would not be.
  */
  it("builds the prompt box as a real labelled form", () => {
    const generate = readFileSync(join(__dirname, "sections", "generate.tsx"), "utf8");
    expect(generate).toMatch(/<form/);
    expect(generate).toMatch(/type="submit"/);
    expect(generate).toMatch(/htmlFor="prompt"/);
    expect(generate).toMatch(/id="prompt"/);
    // Carries the draft through sign-in, which is a full page load.
    expect(generate).toMatch(/sessionStorage/);
  });

  it("pins the public showcase copy as an editable default rather than a locked value", () => {
    const generate = readFileSync(join(__dirname, "sections", "generate.tsx"), "utf8");
    const routes = readFileSync(join(__dirname, "..", "..", "lib", "showcase-routes.ts"), "utf8");
    const actions = readFileSync(join(__dirname, "generate-actions.ts"), "utf8");
    expect(routes).toContain(
      "A tiny chibi witch name Molly helps Barnaby, an elderly seagull scholar wearing tiny spectacles and a sailor cap, retrieve lost sea route memories by brewing a Potion of Golden Sight.",
    );
    expect(generate).toMatch(/defaultValue=\{publicPortfolioMode \? SHOWCASE_STORY : ""\}/);
    expect(generate).not.toMatch(/value=\{SHOWCASE_STORY\}/);
    expect(generate).toContain("SHOWCASE_JOB_HREF");
    expect(generate).toMatch(/action=\{publicPortfolioMode \? SHOWCASE_JOB_HREF : action\}/);
    expect(actions).toMatch(/if \(isPublicPortfolioMode\(\)\)/);
  });

  /*
    The button generates for real: it creates a project and starts a generation
    job against the endpoints the workspace already uses. It must not drift back
    into being a link, and must not invent backend surface.
  */
  it("wires Generate Game to the existing generation endpoints", () => {
    const actions = readFileSync(join(__dirname, "generate-actions.ts"), "utf8");
    expect(actions).toMatch(/^"use server";/);
    expect(actions).toMatch(/apiFetch<Project>\("\/api\/v1\/projects"/);
    expect(actions).toMatch(/\/api\/v1\/projects\/\$\{encodeURIComponent\(project\.id\)\}\/generations/);
    // Idempotency key, as the workspace form sends.
    expect(actions).toMatch(/requestId: crypto\.randomUUID\(\)/);
    // Only those two endpoints — no new backend surface. Comments stripped,
    // since the doc block names them too.
    const endpoints = [...stripComments(actions).matchAll(/\/api\/v1\/[^"`\s]*/g)].map((m) => m[0]);
    expect(endpoints).toHaveLength(2);

    const generate = readFileSync(join(__dirname, "sections", "generate.tsx"), "utf8");
    expect(generate).toMatch(/useActionState\(generateGameAction/);
    expect(generate).toMatch(/action=\{publicPortfolioMode \? SHOWCASE_JOB_HREF : action\}/);
  });

  it("surfaces a failed generation instead of orphaning the project", () => {
    const actions = readFileSync(join(__dirname, "generate-actions.ts"), "utf8");
    // If the job POST fails the project already exists, so hand it back.
    expect(actions).toMatch(/projectId: project\.id/);
    const generate = readFileSync(join(__dirname, "sections", "generate.tsx"), "utf8");
    expect(generate).toMatch(/role="alert"/);
    expect(generate).toMatch(/state\.projectId/);
  });

  /*
    The skyline is absolute inside its own section with the content stacked
    above it — never fixed, never a sibling of the page ground. That is the
    shape that caused light-on-light before.
  */
  it("keeps the section backdrop behind its own content", () => {
    const zOf = (name: string) => Number(/z-index:\s*(-?\d+)/.exec(declarationsFor(name))![1]);
    expect(declarationsFor("generateBackdrop")).toMatch(/position:\s*absolute/);
    expect(zOf("generateBackdrop")).toBeLessThan(zOf("generateScrim"));
    expect(zOf("generateScrim")).toBeLessThan(zOf("generateInner"));
  });

  /*
    Nearest-neighbour belongs on the upscaled buffer, not on the footage.
    `.worldCanvas` blows a 208x117 buffer up, so `pixelated` keeps its pixels
    square. The video is a 1920px source scaled *down* into the frame, where
    point-sampling aliases and shimmers — so it must scale smoothly and fill
    with `object-fit`.
  */
  it("scales the procedural buffer with nearest-neighbour", () => {
    expect(declarationsFor("worldCanvas")).toMatch(/image-rendering:\s*pixelated/);
  });

  it("scales footage smoothly and fills the frame", () => {
    const video = declarationsFor("gameVideo");
    expect(video).toMatch(/object-fit:\s*cover/);
    expect(video).not.toMatch(/image-rendering:\s*pixelated/);
  });

  it("uses stepped clip-paths, never a smooth diagonal", () => {
    // A pixel grid cannot make a 45-degree cut, so every chamfer is a staircase:
    // each clip-path must have well more than the four points of a plain rect.
    for (const name of ["promptBox"]) {
      const clip = /clip-path:\s*polygon\(([\s\S]*?)\)/.exec(declarationsFor(name))?.[1];
      expect(clip, `.${name} has no clip-path`).toBeTruthy();
      expect(clip!.split(",").length).toBeGreaterThan(8);
    }
  });

  it("falls back to a drawn scene when a clip file is missing", () => {
    const gameVideo = readFileSync(join(__dirname, "game-video.tsx"), "utf8");
    expect(gameVideo).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
    expect(gameVideo).toMatch(/fallbackWorldId/);
    // Autoplaying footage must be muted or browsers block it outright.
    expect(gameVideo).toMatch(/\bmuted\b/);
    expect(gameVideo).toMatch(/playsInline/);
  });

  it("keeps the page container tall enough to cover the viewport", () => {
    expect(declarationsFor("page")).toMatch(/min-height:\s*100svh/);
  });

  it("paints an opaque dark ground on the page container", () => {
    expect(declarationsFor("page")).toMatch(/background-color:\s*var\(--ground,\s*#090a0f\)/);
    expect(declarationsFor("page")).toMatch(/--ground:\s*#090a0f/);
  });

  /*
    The ground is set explicitly rather than through a selector. A `:has()`
    rule was present and correct in the served CSS yet did not take effect in
    the browser, so the container carries inline styles and html/body are set
    imperatively — neither can be defeated by cascade order or selector
    support.
  */
  it("paints the landing ground inline on the root container", () => {
    expect(experience).toMatch(/const GROUND = "#090a0f"/);
    expect(experience).toMatch(/const INK = "#f2ede4"/);
    expect(experience).toMatch(
      /style=\{\{\s*backgroundColor:\s*GROUND,\s*color:\s*INK,\s*minHeight:\s*"100svh"\s*\}\}/,
    );
  });

  it("sets and restores html/body ground imperatively", () => {
    expect(experience).toMatch(/setProperty\("background-color", GROUND, "important"\)/);
    expect(experience).toMatch(/setProperty\("color-scheme", "dark", "important"\)/);
    expect(experience).toMatch(/setProperty\("color", INK, "important"\)/);
    // Cleared on unmount, so client-side navigation leaves nothing behind.
    expect(experience).toMatch(/html\.style\.removeProperty\("background-color"\)/);
    expect(experience).toMatch(/body\.style\.removeProperty\("background-color"\)/);
  });

  /*
    Defaults must fail safe. A light default plus one failed override is a white
    page you cannot read; a dark default plus one failed override is just a dark
    workspace. So the dark ground is the default everywhere.
  */
  it("defaults html and body to the dark ground", () => {
    expect(globals).toMatch(/html,\s*body\s*\{[^}]*background:\s*#090a0f/);
    expect(globals).toMatch(/html,\s*body\s*\{[^}]*color-scheme:\s*dark/);
  });

  /*
    The workspace used to opt into a light "paper" ground, which made the
    signed-in half of the product look like a different product. Both halves now
    share one palette: the token names stayed, the values were repointed.
  */
  it("gives the workspace the same ground as the landing", () => {
    const root = /:root\s*\{([\s\S]*?)\}/.exec(globals)?.[1] ?? "";
    expect(root).toMatch(/--paper:\s*#090a0f/);
    expect(root).toMatch(/--ink:\s*#f2ede4/);
    // Same accent as the landing's --ember.
    expect(root).toMatch(/--accent:\s*#e4633a/);

    // .app-shell carries the ground itself, and it must be the dark token.
    const shell = /\.app-shell\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(shell).toMatch(/background-color:\s*var\(--paper\)/);
    expect(shell).not.toMatch(/color-scheme:\s*light/);
  });

  /*
    The workspace must share the landing's *depth*, not just its base colour — a
    flat fill beside the landing's layered ground reads as a different product.
    `landing.module.css` is a CSS Module, so its rules and keyframe names are
    scoped and cannot be reused directly; the stacks are duplicated and this
    compares them so they cannot drift apart.
  */
  it("gives the workspace the landing's layered ground, not a flat fill", () => {
    /*
      Split on `;` only at paren depth 0 and outside quotes. A regex cannot do
      this: the grain layer is a `url("data:image/svg+xml;...")` whose value
      contains both a semicolon and unbalanced-looking parens, so a naive
      pattern truncates it — and then compares two truncated strings, which
      passes while checking almost nothing.
    */
    const splitDeclarations = (body: string) => {
      const out: string[] = [];
      let buffer = "";
      let depth = 0;
      let quote: string | null = null;
      for (const character of body) {
        if (quote) {
          if (character === quote) quote = null;
        } else if (character === '"' || character === "'") {
          quote = character;
        } else if (character === "(") {
          depth += 1;
        } else if (character === ")") {
          depth -= 1;
        } else if (character === ";" && depth === 0) {
          out.push(buffer);
          buffer = "";
          continue;
        }
        buffer += character;
      }
      out.push(buffer);
      return out.map((declaration) => declaration.trim()).filter(Boolean);
    };

    /*
      Every rule whose selector list contains this exact selector. Matching only
      the first would pick up the shared `.shell::before, .shell::after` rule
      and miss the individual one — which is how the near-star layer went
      missing from the workspace in the first place.
    */
    const declaration = (text: string, selector: string, property: string) => {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "");
      const found = [...code.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
        .filter(([, list]) => list.split(",").some((part) => part.trim() === selector))
        .flatMap(([, , body]) => splitDeclarations(body))
        .filter((decl) => decl.split(":")[0].trim() === property);
      return found.map((decl) => decl.slice(decl.indexOf(":") + 1).replace(/\s+/g, " ").trim());
    };

    for (const [selector, property] of [
      [".shell", "background-image"],
      [".shell", "background-size"],
      [".shell::before", "background-image"],
      [".shell::before", "background-size"],
      [".shell::after", "background-image"],
      [".shell::after", "background-size"],
    ] as const) {
      const landing = declaration(css, selector, property);
      const workspace = declaration(globals, selector.replace(".shell", ".app-shell"), property);
      expect(landing, `${selector} ${property} missing from the landing`).not.toHaveLength(0);
      expect(workspace, `${selector} ${property} differs from the landing`).toEqual(landing);
    }

    // The grain layer must survive intact, not be truncated at its data URI.
    expect(declaration(globals, ".app-shell", "background-image")[0]).toContain("feTurbulence");

    // And the layers must stay behind the content, as on the landing.
    const layers = /\.app-shell::before,\s*\n\.app-shell::after\s*\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(layers).toMatch(/z-index:\s*-1/);
    expect(layers).toMatch(/position:\s*fixed/);
    // -1 only stays contained if .app-shell forms a stacking context.
    expect(/\.app-shell\s*\{([^}]*)\}/.exec(globals)?.[1]).toMatch(/position:\s*relative/);
  });

  it("leaves no light hardcoded surfaces in the workspace", () => {
    const code = globals.replace(/\/\*[\s\S]*?\*\//g, "");
    // Serif headings and white fields were the two giveaways.
    expect(code).not.toMatch(/Georgia/);
    expect(code).not.toMatch(/background:\s*white/);
    expect(code).not.toMatch(/#fffdf7|#f4f1e8|#c9c5b9|#bbb7aa/);
  });

  /*
    The workspace is a game tool, so its chrome is set in the same bitmap face
    as the landing. Long-form copy is the exception — a project description can
    run to thousands of characters, where a bitmap face stops being
    characterful and becomes hard to read.
  */
  it("sets the workspace chrome in the bitmap face", () => {
    const pixel = /font-family:\s*var\(--font-pixel\)/;
    for (const selector of [
      "\\.app-shell :is\\(h1, h2, h3\\)",
      "\\.app-shell :is\\(\\.button, \\.text-button, \\.back-pill, \\.brand\\)",
      "\\.app-shell :is\\(label, input, textarea, select, code\\)",
    ]) {
      const rule = new RegExp(`${selector}[\\s\\S]*?\\{([^}]*)\\}`).exec(globals)?.[1] ?? "";
      expect(rule, selector).toMatch(pixel);
    }
    // Placeholders too, as on the landing's prompt box.
    expect(globals).toMatch(/::placeholder \{[^}]*var\(--font-pixel\)/);
  });

  it("scales the bitmap headings down from the sans scale", () => {
    // Silkscreen at clamp(2.2rem, 5vw, 4rem) is enormous and wraps badly.
    const h1 = /\.app-shell h1 \{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(h1).toMatch(/font-size:\s*clamp\(1\.05rem/);
    expect(h1).toMatch(/text-transform:\s*uppercase/);
    expect(h1).toMatch(/letter-spacing:/);
  });

  it("keeps long-form workspace copy in the readable sans", () => {
    const exception = /\.app-shell :is\(\.lede, \.project-card p[\s\S]*?\{([^}]*)\}/.exec(globals)?.[1] ?? "";
    expect(exception).toMatch(/font-family:\s*inherit/);
    expect(exception).toMatch(/text-transform:\s*none/);
  });

  it("gives the workspace a way back to the public site", () => {
    const layout = readFileSync(join(__dirname, "..", "..", "app", "(app)", "layout.tsx"), "utf8");
    expect(layout).toMatch(/className="back-pill"/);
    expect(layout).toMatch(/href="\/"/);
    expect(globals).toMatch(/\.back-pill\s*\{/);
  });

  it("forces the landing ground so it cannot lose to a stylesheet", () => {
    expect(experience).toMatch(/setProperty\("background-color", GROUND, "important"\)/);
  });

  /*
    The page rendered white-on-white repeatedly: `.page` held the background
    while `.shell` held the text, with fixed full-viewport layers in between
    that could cover the ground while the type still painted above them. The
    background now lives on the content wrapper itself.
  */
  it("puts the dark ground on the element that holds the text", () => {
    expect(declarationsFor("shell")).toMatch(/background-color:\s*#090a0f/);
  });

  it("has no sibling layer that can come between the ground and the text", () => {
    // The atmosphere is back, but as background-images and ::before/::after on
    // .shell — never as separate elements stacked between it and the content.
    for (const layer of ["ground", "grain", "pixelGrid", "atmosphere", "stars"]) {
      expect(declarationsFor(layer), `.${layer} must not return as an element`).toHaveLength(0);
    }
    expect(stripComments(experience)).not.toMatch(/Atmosphere|styles\.(grain|pixelGrid|ground|stars)/);
  });

  /*
    `.shell` is `position: relative; z-index: 1`, so it forms a stacking context
    and a `z-index: -1` pseudo-element is contained within it — painting above
    its background-color but below every piece of content. Any other value puts
    decoration on top of the type, which is exactly how this broke before.
  */
  it("keeps the decorative pseudo-layers below the content", () => {
    const pseudo = RULES.filter((rule) =>
      rule.selector.split(",").some((part) => /^\.[\w-]*shell[\w-]*::?(before|after)$/.test(part.trim())),
    );
    expect(pseudo.length, "no .shell pseudo-element rules found").toBeGreaterThan(0);
    const withZ = pseudo.filter((rule) => /z-index/.test(rule.body));
    expect(withZ.length, "no z-index declared on the pseudo-layers").toBeGreaterThan(0);
    for (const rule of withZ) {
      expect(rule.body, rule.selector).toMatch(/z-index:\s*-1/);
    }
  });

  it("twinkles slowly, on two out-of-phase periods", () => {
    for (const frames of ["driftFar", "driftNear"]) {
      expect(css).toMatch(new RegExp(`@keyframes\\s+${frames}`));
    }
    // Long periods — a fast blink reads as a fault, not a sky.
    const periods = [...css.matchAll(/animation:\s*drift\w+\s+(\d+)s/g)].map((m) => Number(m[1]));
    expect(periods.length).toBe(2);
    for (const seconds of periods) expect(seconds).toBeGreaterThanOrEqual(10);
  });

  it("carries grain and the pixel lattice on the content element itself", () => {
    const shell = declarationsFor("shell");
    expect(shell).toMatch(/repeating-linear-gradient/);
    expect(shell).toMatch(/feTurbulence/);
  });

  /* The nav floats above the content, so it carries its own backing. */
  it("gives the fixed nav an opaque background", () => {
    expect(declarationsFor("nav")).toMatch(/background-color:\s*#090a0f/);
  });

  /*
    A poster (or icon) pointing at a file that is not there is a failed image
    load, and the browser draws a broken-image placeholder for it. There must be
    no image reference on the page that can 404.
  */
  it("holds no image reference that can fail to load", () => {
    const media = readFileSync(join(__dirname, "media.ts"), "utf8");
    const gameVideo = readFileSync(join(__dirname, "game-video.tsx"), "utf8");
    expect(stripComments(media)).not.toMatch(/poster/);
    expect(stripComments(gameVideo)).not.toMatch(/poster=/);
  });

  it("declares a favicon that cannot 404 or fail to parse", () => {
    const icon = readFileSync(join(__dirname, "..", "..", "app", "icon.svg"), "utf8");
    // App Router serves app/icon.svg as metadata, so the favicon is a real,
    // parseable local asset rather than a browser fallback or broken URL.
    expect(icon).toMatch(/<svg/);
    expect(icon).toMatch(/#e4633a/);
    expect(icon).toMatch(/<path/);
  });

  /*
    Text is white again, which is only safe because the ground now sits on
    `.shell` — the same element that holds the type — so the background cannot
    go missing independently of it. The guard that matters is therefore the
    pairing: contrast is measured against the ground `.shell` actually declares,
    not against a colour assumed elsewhere.
  */
  it("keeps every text colour readable against the ground .shell declares", () => {
    const luminance = (hex: string) => {
      const parts = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      const lin = parts.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
      return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    };
    const contrast = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    // Read the ground straight off .shell rather than hard-coding it, so the
    // two can never drift apart without this failing.
    const ground = /background-color:\s*(#[0-9a-f]{6})/.exec(declarationsFor("shell"))?.[1];
    expect(ground, ".shell declares no background-color").toBeTruthy();

    const page = declarationsFor("page");
    for (const token of ["chalk", "chalk-dim", "stone", "stone-dim", "ember"]) {
      const hex = new RegExp(`--${token}:\\s*(#[0-9a-f]{6})`).exec(page)?.[1];
      expect(hex, `--${token} is not a hex value`).toBeTruthy();
      expect(contrast(hex!, ground!), `--${token} on ${ground}`).toBeGreaterThanOrEqual(4);
    }
  });

  /* A single-colour cursor disappears against game footage or the ground. */
  it("gives the cursor contrast against any backdrop", () => {
    expect(declarationsFor("cursorDot")).toMatch(/box-shadow:[\s\S]*rgb\(9 10 15/);
    expect(declarationsFor("cursorRing")).toMatch(/box-shadow:[\s\S]*rgb\(9 10 15/);
  });

  it("gives the secondary CTA its own fill so it never relies on the page ground", () => {
    const decls = declarationsFor("ctaGhost");
    expect(decls).toMatch(/background-color:\s*rgb\(242 237 228 \/ 7%\)/);
    expect(decls).toMatch(/border:\s*1px solid rgb\(242 237 228 \/ 30%\)/);
  });

  /*
    Every custom property referenced must be defined in this stylesheet. An
    undefined `var()` makes the whole declaration invalid at computed-value
    time, so a token that is moved or renamed silently strips backgrounds and
    borders with no error anywhere — which is exactly what happened when the
    arcade tokens were moved off `.hud`.
  */
  it("defines every custom property it references", () => {
    const declared = new Set([...css.matchAll(/(--[a-z][\w-]*)\s*:/g)].map((m) => m[1]));

    /*
      Two legitimate outside sources: next/font publishes the faces on <html>,
      and components set per-element values inline. Both sets are read from the
      source rather than hard-coded, so neither can go stale — adding a font in
      layout.tsx should not require editing this test.
    */
    const external = new Set<string>();
    const layout = readFileSync(join(__dirname, "..", "..", "app", "layout.tsx"), "utf8");
    for (const [, font] of layout.matchAll(/variable:\s*"(--[a-z][\w-]*)"/g)) {
      external.add(font);
    }
    expect(external.size, "no next/font variables found in layout.tsx").toBeGreaterThan(0);
    for (const file of [
      ...readdirSync(__dirname, { recursive: true, encoding: "utf8" }),
    ].filter((name) => /\.tsx?$/.test(name) && !name.includes(".test."))) {
      const source = readFileSync(join(__dirname, file), "utf8");
      for (const [, inline] of source.matchAll(/\["(--[a-z][\w-]*)" as string\]/g)) {
        external.add(inline);
      }
      for (const [, imperative] of source.matchAll(/setProperty\(\s*"(--[a-z][\w-]*)"/g)) {
        external.add(imperative);
      }
    }
    const referenced = [...css.matchAll(/var\(\s*(--[a-z][\w-]*)/g)].map((m) => m[1]);

    const undefinedTokens = [...new Set(referenced)]
      .filter((token) => !declared.has(token) && !external.has(token))
      // A var() with its own fallback still renders, so only flag bare ones.
      .filter((token) => !new RegExp(`var\\(\\s*${token}\\s*,`).test(css));

    expect(undefinedTokens).toEqual([]);
  });

  it("clips the hero's deliberate overhang on the hero itself", () => {
    expect(declarationsFor("hero")).toMatch(/overflow-x:\s*clip/);
  });

  /* The page is for people making games, not reading invoices. */
  it("carries no pipeline or console vocabulary in the copy", () => {
    const banned = [
      /STATUS:/i, /JOB COST/i, /ASSETS:\s*\d/i, /SUCCEEDED/, /QUEUED/, /TIMED_OUT/,
      /IN_REVIEW/, /SUPERSEDED/, /sha256/i, /gen_[0-9a-f]/, /\bcredit\b/i,
    ];
    for (const source of sections) {
      for (const pattern of banned) expect(source).not.toMatch(pattern);
    }
  });

  /*
    A 1px-in-3px black scanline overlay was used in three places — the demo
    cabinet, the hero video frame and the generation console screen — and on a
    large display every one read as horizontal banding across the flat areas of
    the art underneath. Lowering the opacity does not help: the artefact is the
    regular period, not the darkness.

    The rule is about black specifically, not about repetition. The page
    lattice and the pipeline's dashed connectors both repeat too, but they are
    faint cream on a dark ground and sit on their own elements rather than over
    artwork. A repeating black line is the shape that caused the problem.
  */
  it("lays no repeating black line over any artwork", () => {
    const sheets = [
      "components/demo/demo.module.css",
      "components/landing/landing.module.css",
      "components/generation-console.module.css",
      "app/globals.css",
    ];
    const root = join(__dirname, "..", "..");
    for (const sheet of sheets) {
      const css = readFileSync(join(root, sheet), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const match of css.matchAll(/repeating-linear-gradient\(([\s\S]*?)\)\s*[,;]/g)) {
        expect(
          match[1],
          `${sheet}: repeating gradient painting black over the art`,
        ).not.toMatch(/rgb\(0 0 0|#000|rgba\(0, *0, *0/);
      }
    }
  });
});
