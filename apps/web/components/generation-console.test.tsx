import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GenerationStatus } from "./generation-status";
import type { GenerationJob } from "@/lib/types";

const MODULE_CSS = readFileSync(join(__dirname, "generation-console.module.css"), "utf8");
const GLOBAL_CSS = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

/** (ids, classes, elements) — enough for the selectors in play here. */
function specificity(selector: string): [number, number, number] {
  const cleaned = selector.replace(/::?[a-z-]+(\([^)]*\))?/g, " ");
  return [
    (cleaned.match(/#[\w-]+/g) ?? []).length,
    (cleaned.match(/\.[\w-]+/g) ?? []).length + (cleaned.match(/\[[^\]]+\]/g) ?? []).length,
    (cleaned.match(/(?:^|[\s>+~])[a-z][\w-]*/g) ?? []).length,
  ];
}

function beats(a: string, b: string) {
  const [ai, ac, ae] = specificity(a);
  const [bi, bc, be] = specificity(b);
  if (ai !== bi) return ai > bi;
  if (ac !== bc) return ac > bc;
  return ae > be;
}

/** Every selector in `css` that declares `prop`. */
function selectorsDeclaring(css: string, prop: string) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found: string[] = [];
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (new RegExp(`(^|;)\\s*${prop}\\s*:`).test(match[2])) found.push(match[1].trim());
  }
  return found;
}

const waitingJob: GenerationJob = {
  id: "job-console",
  projectId: "project-console",
  prompt: "A synthetic fixture.",
  status: "RUNNING",
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:01:00Z",
  completedAt: null,
  attemptNumber: 2,
  canCancel: true,
  canRetry: false,
  contentVersion: null,
};

afterEach(cleanup);

describe("generation console styling", () => {
  it("gives the page title a rule that outranks the workspace heading rule", () => {
    // The bug this replaces: `.generation-page h1` and `.app-shell h1` had equal
    // specificity, so the intended size lost purely on source order.
    const workspaceH1 = selectorsDeclaring(GLOBAL_CSS, "font-size").filter((s) =>
      /\.app-shell\s+h1\b/.test(s),
    );
    expect(workspaceH1).toHaveLength(1);

    const titleRule = selectorsDeclaring(MODULE_CSS, "font-size").filter((s) =>
      /\.header\s+\.title\b/.test(s),
    );
    expect(titleRule).toHaveLength(1);

    expect(beats(titleRule[0], workspaceH1[0])).toBe(true);
  });

  it("no longer carries the dead .generation-page h1 rule", () => {
    expect(GLOBAL_CSS).not.toMatch(/\.generation-page/);
  });

  it("sizes every console heading through a rule that outranks the workspace", () => {
    /*
      globals.css sizes `.app-shell :is(h1, h2, h3)` at 0,1,1. A bare module
      class is 0,1,0 and silently loses, so each class applied to a heading
      element here has to be reached through a nested selector.
    */
    const headingClasses = ["title", "heading", "subheading"];
    for (const name of headingClasses) {
      const rules = selectorsDeclaring(MODULE_CSS, "font-size").filter((selector) =>
        new RegExp(`\\.${name}\\b`).test(selector),
      );
      expect(rules, `no font-size rule for .${name}`).not.toHaveLength(0);
      for (const rule of rules) {
        expect(beats(rule, ".app-shell h1"), `${rule} must outrank .app-shell h1`).toBe(true);
      }
    }
  });
});

/** A finished job carrying one image asset and one JSON asset. */
function finishedJob(): GenerationJob {
  return {
    ...waitingJob,
    status: "SUCCEEDED",
    canCancel: false,
    completedAt: "2026-01-01T00:02:00Z",
    contentVersion: {
      id: "version-1",
      versionNumber: 3,
      status: "DRAFT",
      title: "Thaw at Saltfurrow",
      content: { version: "playable-game-content/v1", synopsis: "A cold morning.", scenes: [{}] },
      createdAt: "2026-01-01T00:02:00Z",
      assets: [
        {
          assetType: "PLAYER_DIRECTION",
          bucket: "forge-generation-assets",
          key: "projects/p/generation-jobs/j/attempts/a/player/down.png",
          contentType: "image/png",
          sizeBytes: 11210,
          sha256: "a".repeat(64),
          metadata: {},
        },
        {
          assetType: "PLAYABLE_MANIFEST",
          bucket: "forge-generation-assets",
          key: "projects/p/generation-jobs/j/attempts/a/playable-manifest.v1.json",
          contentType: "application/json",
          sizeBytes: 7105,
          sha256: "b".repeat(64),
          metadata: {},
        },
      ],
    },
  };
}

describe("generation console result", () => {
  it("previews image assets through the same-origin asset route", () => {
    render(<GenerationStatus initialJob={finishedJob()} />);

    const preview = screen.getByRole("img", { name: /player direction preview/i });
    /*
      Not the storage URL: those responses carry no CORS headers, so the
      browser cannot read them. The proxy route is what makes a preview
      possible at all.
    */
    expect(preview).toHaveAttribute(
      "src",
      "/api/projects/project-console/generations/job-console/assets/" +
        "projects/p/generation-jobs/j/attempts/a/player/down.png",
    );
    expect(preview.getAttribute("src")).not.toContain("s3://");
  });

  it("gives a non-image asset a type chip instead of a broken preview", () => {
    render(<GenerationStatus initialJob={finishedJob()} />);
    // The manifest JSON is the only non-image in practice.
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("JSON")).toBeInTheDocument();
  });

  it("names the three same-typed player strips apart, from their keys", () => {
    // PLAYER_DIRECTION is shared by down/up/right, so the type cannot label it.
    render(<GenerationStatus initialJob={finishedJob()} />);
    expect(screen.getByText("down")).toBeInTheDocument();
    expect(screen.getByText(/Player direction/i)).toBeInTheDocument();
  });

  it("drops a preview that fails to load rather than showing a broken image", () => {
    render(<GenerationStatus initialJob={finishedJob()} />);
    fireEvent.error(screen.getByRole("img", { name: /player direction preview/i }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    // The tile survives; only the image is dropped.
    expect(screen.getByText("down")).toBeInTheDocument();
  });

  it("omits the whole assets block when a version carries none", () => {
    /*
      Showcase entries that are not playable bundles have no assets. A bare
      "Assets" heading over an empty grid and an empty developer panel reads as
      a load failure rather than as "nothing to show".
    */
    const job = finishedJob();
    job.contentVersion!.assets = [];
    const { container } = render(<GenerationStatus initialJob={job} />);

    expect(screen.queryByText("Assets")).not.toBeInTheDocument();
    expect(screen.queryByText(/developer details/i)).not.toBeInTheDocument();
    expect(container.querySelector("details")).toBeNull();
    // The rest of the result still renders.
    expect(screen.getByRole("heading", { name: /thaw at saltfurrow/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play World" })).toBeInTheDocument();
  });

  it("keeps the raw storage paths present but collapsed by default", () => {
    const { container } = render(<GenerationStatus initialJob={finishedJob()} />);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText(/developer details/i)).toBeInTheDocument();

    // Still there for debugging, just not in the way.
    const raw = screen.getByText(
      "s3://forge-generation-assets/projects/p/generation-jobs/j/attempts/a/player/down.png",
    );
    expect(details?.contains(raw)).toBe(true);
  });

  it("puts the raw paths nowhere except that panel", () => {
    const { container } = render(<GenerationStatus initialJob={finishedJob()} />);
    const details = container.querySelector("details");
    for (const node of container.querySelectorAll("code")) {
      if (!node.textContent?.startsWith("s3://")) continue;
      expect(details?.contains(node), node.textContent).toBe(true);
    }
  });
});

describe("generation console readout", () => {
  it("draws an indeterminate gauge rather than a fabricated percentage", () => {
    const { container } = render(<GenerationStatus initialJob={waitingJob} />);

    // No progressbar semantics: the API reports no position, so claiming one
    // through ARIA would be a number this page does not have.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-valuenow]")).toBeNull();

    const segments = container.querySelectorAll("i");
    expect(segments.length).toBeGreaterThan(8);
    // The gauge is decoration, so it stays out of the live region's narration.
    for (const segment of segments) {
      expect(segment.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("keeps the boot-sequence flavour decorative and the real status narrated", () => {
    render(<GenerationStatus initialJob={waitingJob} />);

    const ritual = screen.getByText(/forging assets/i);
    expect(ritual.closest("[aria-hidden='true']")).not.toBeNull();

    // The genuine status text is what assistive tech and the user both get.
    expect(
      screen.getByRole("heading", { name: /the worker is generating content/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/processing attempt 2/i)).toBeInTheDocument();
  });

  it("preserves the attempt indicator on the console readout", () => {
    render(<GenerationStatus initialJob={waitingJob} />);
    expect(screen.getByText(/^Attempt 2$/)).toBeInTheDocument();
  });

  it("names the transport honestly when the event stream is unavailable", () => {
    // jsdom has no EventSource, so the hook stays disconnected and the
    // two-second fallback is what actually runs.
    render(<GenerationStatus initialJob={waitingJob} />);

    expect(screen.getByText("Polling")).toBeInTheDocument();
    expect(screen.getByText(/every two seconds/i)).toBeInTheDocument();
  });

  it("integrates the way back into the console action deck", () => {
    render(<GenerationStatus initialJob={waitingJob} />);

    const back = screen.getByRole("link", { name: /project/i });
    expect(back).toHaveAttribute("href", "/projects/project-console");
    // Same panel as the cancel control, not a stray link above the title.
    expect(back.closest("footer")).not.toBeNull();
    expect(
      back.closest("footer")?.contains(screen.getByRole("button", { name: "Cancel generation" })),
    ).toBe(true);
  });
});
