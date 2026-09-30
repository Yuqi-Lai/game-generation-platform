import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Hero from "./sections/hero";
import Workflow from "./sections/workflow";
import Generate from "./sections/generate";
import DemoExperience from "@/components/demo/demo-experience";

/**
 * Hydration guard.
 *
 * `<p>` accepts only phrasing content. When flow content — a heading, a div, a
 * list — appears inside one, the HTML parser closes the paragraph early, so the
 * DOM the browser builds from the server HTML no longer matches the tree React
 * renders on the client, and hydration fails for the whole subtree.
 *
 * React does not warn about this at build time and the page still looks right
 * in dev, so it is worth asserting against the actual rendered markup rather
 * than trusting review. A real `<h3>` inside a `<p>` shipped in The Loop and
 * only surfaced as a console error in the browser.
 */
const SECTIONS: Array<[string, React.ReactElement]> = [
  ["Hero", <Hero signedIn={false} key="hero" />],
  ["Workflow", <Workflow key="workflow" />],
  ["Generate", <Generate signedIn={false} key="generate" />],
  ["DemoExperience", <DemoExperience key="demo" />],
];

/** Content that forces a paragraph closed. */
const FLOW_CONTENT = /<(h[1-6]|div|ul|ol|li|section|article|header|footer|p|form|figure|table)\b/;

/** The inner HTML of each paragraph, excluding its own opening tag. */
function paragraphContents(html: string) {
  return [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((match) => match[1]);
}

describe("server-rendered markup nests legally", () => {
  /*
    Proves the check can actually fail. Without this, a regex that matches
    nothing would make every case below pass vacuously — which is exactly what
    happened on the first attempt, where the pattern matched each paragraph's
    own opening tag instead of its contents.
  */
  it("detects flow content inside a paragraph", () => {
    const bad = "<p class=\"x\"><span>1-1</span><h3>Generate</h3></p>";
    expect(paragraphContents(bad).some((inner) => FLOW_CONTENT.test(inner))).toBe(true);

    const good = "<p class=\"x\"><span>1-1</span><button>Next</button></p>";
    expect(paragraphContents(good).some((inner) => FLOW_CONTENT.test(inner))).toBe(false);
  });

  it.each(SECTIONS)("%s puts only phrasing content inside <p>", (name, element) => {
    const html = renderToStaticMarkup(element);
    const offenders = paragraphContents(html)
      .map((inner) => FLOW_CONTENT.exec(inner)?.[1])
      .filter(Boolean);
    expect(offenders, `${name} has flow content inside a <p>`).toEqual([]);
  });

  it.each(SECTIONS)("%s renders something on the server at all", (_name, element) => {
    // Guards against the sections silently becoming client-only, which would
    // make the check above pass vacuously.
    expect(renderToStaticMarkup(element).length).toBeGreaterThan(200);
  });
});
