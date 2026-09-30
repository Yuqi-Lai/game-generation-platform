import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => {
  class ApiError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  }
  return { ApiError, apiFetch: vi.fn() };
});

vi.mock("@/lib/api", () => ({ ApiError: api.ApiError, apiFetch: api.apiFetch }));
vi.mock("@/components/generate-content-form", () => ({ GenerateContentForm: () => null }));
vi.mock("@/components/content-version-review", () => ({ ContentVersionReview: () => null }));
vi.mock("@/components/content-pack-manager", () => ({ ContentPackManager: () => null }));
vi.mock("@/components/project-realtime-refresh", () => ({ ProjectRealtimeRefresh: () => null }));

import ProjectDetailPage from "./page";

const PROJECT = "project-1";

/** Answers each of the page's fetches by path. */
function stubApi(generations: unknown[]) {
  api.apiFetch.mockImplementation(async (path: string) => {
    if (path.endsWith("/generations")) return generations;
    if (path.endsWith("/members")) return [];
    if (path.endsWith("/content-versions")) return [];
    if (path.endsWith("/content-packs")) return [];
    if (path.endsWith("/credits")) {
      return { available: 100, reserved: 0, consumed: 0, generationCost: 10 };
    }
    return {
      id: PROJECT,
      name: "Saltfurrow",
      description: "",
      status: "ACTIVE",
      currentUserRole: "OWNER",
    };
  });
}

async function renderPage() {
  const element = await ProjectDetailPage({ params: Promise.resolve({ id: PROJECT }) });
  return renderToStaticMarkup(element);
}

describe("project page generation history", () => {
  /*
    Without this list a finished generation is unreachable: the job id lives
    only in the URL the generate flow redirects to, so closing that page used
    to lose the result and its asset grid even though the job was intact.
  */
  it("links each job to its own detail page", async () => {
    stubApi([
      {
        id: "job-a",
        status: "SUCCEEDED",
        failureCode: null,
        createdAt: "2026-09-30T01:57:00Z",
        completedAt: "2026-09-30T02:01:00Z",
        attemptNumber: 1,
        contentVersionId: "version-a",
        contentVersionTitle: "Thaw at Saltfurrow",
      },
    ]);

    const html = await renderPage();

    expect(html).toContain(`href="/projects/${PROJECT}/generations/job-a"`);
    expect(html).toContain("Thaw at Saltfurrow");
    expect(html).toContain("SUCCEEDED");
    // The list endpoint is what makes this possible at all.
    expect(api.apiFetch).toHaveBeenCalledWith(`/api/v1/projects/${PROJECT}/generations`);
  });

  it("labels a job that has no version yet, rather than rendering a blank row", async () => {
    stubApi([
      {
        id: "job-b",
        status: "RUNNING",
        failureCode: null,
        createdAt: "2026-09-30T03:00:00Z",
        completedAt: null,
        attemptNumber: 2,
        contentVersionId: null,
        contentVersionTitle: null,
      },
    ]);

    const html = await renderPage();

    expect(html).toContain("Draft in progress");
    expect(html).toContain(`href="/projects/${PROJECT}/generations/job-b"`);
  });

  it("formats the timestamp without a locale, so the server output is stable", async () => {
    stubApi([
      {
        id: "job-c",
        status: "FAILED",
        failureCode: "PROVIDER_ERROR",
        createdAt: "2026-09-30T01:57:33Z",
        completedAt: null,
        attemptNumber: 1,
        contentVersionId: null,
        contentVersionTitle: null,
      },
    ]);

    const html = await renderPage();
    expect(html).toContain("2026-09-30 01:57");
  });

  it("shows an empty state instead of a bare heading", async () => {
    stubApi([]);
    const html = await renderPage();
    expect(html).toContain("No generations yet");
    expect(html).not.toContain("generation-list");
  });
});

describe("showcase project data isolation", () => {
  const workspace = JSON.parse(
    readFileSync(join(__dirname, "..", "..", "..", "..", "data", "showcase", "workspace.json"), "utf8"),
  ) as {
    projects: { id: string; name: string; description: string }[];
    details: Record<string, { generationBrief: string; versions: { title: string }[] }>;
  };

  /*
    The bug: one module-level constant supplied the brief for every showcase
    project, so the cyberpunk project's detail page showed Molly's story. Each
    project has to carry its own.
  */
  it("gives every project its own brief", () => {
    const briefs = Object.values(workspace.details).map((d) => d.generationBrief);
    expect(briefs).toHaveLength(3);
    expect(new Set(briefs).size).toBe(3);
    for (const brief of briefs) expect(brief.length).toBeGreaterThan(40);
  });

  it("matches each brief to its own project", () => {
    expect(workspace.details["molly-barnaby"].generationBrief).toMatch(/Molly/);
    expect(workspace.details["rainy-cyberpunk-city"].generationBrief).toMatch(
      /^A rainy cyberpunk city avenue at midnight/,
    );
    expect(workspace.details["crossing-inn"].generationBrief).toMatch(
      /^On a stormy night, a one-armed veteran hunter/,
    );
    // And no brief leaks another project's subject.
    expect(workspace.details["rainy-cyberpunk-city"].generationBrief).not.toMatch(/Molly|hunter/i);
    expect(workspace.details["crossing-inn"].generationBrief).not.toMatch(/Molly|cyberpunk/i);
  });

  it("carries the renamed third project throughout, with no trace of the old one", () => {
    const third = workspace.projects[2];
    expect(third.id).toBe("crossing-inn");
    expect(third.name).toBe("THE ONE-ARMED HUNTER - CROSSING INN");
    expect(third.description).toMatch(/one-armed hunter warns of an abyssal beast/);
    // The old identity must be gone from the data entirely, ids included.
    expect(JSON.stringify(workspace)).not.toMatch(/lumen|Gemini Canary/i);
  });

  /*
    A partial rename is the same class of bug as the shared brief: the hunter
    project listing witch drafts, or a pack item still titled "The Alchemist's
    Dawn Pier" because the pack copies the version title. Sweeping the whole
    subtree is the only way to catch the copies.
  */
  it("carries no other project's subject anywhere in its own data", () => {
    const THEMES: Record<string, string[]> = {
      "molly-barnaby": ["witch", "molly", "barnaby", "seagull", "potion", "farm",
        "tide", "coastal", "dawn", "pier", "wharf", "alchemist"],
      "rainy-cyberpunk-city": ["cyberpunk", "neon", "courier", "ramen", "arcade",
        "billboard", "street"],
      "crossing-inn": ["hunter", "inn", "tavern", "abyssal", "hearth", "aqueduct",
        "beast", "blackridge", "floorboard", "crossing", "drainage", "greatsword", "storm"],
    };

    for (const [id, own] of Object.entries(THEMES)) {
      const blob = JSON.stringify(workspace.details[id]).toLowerCase();
      for (const [other, words] of Object.entries(THEMES)) {
        if (other === id) continue;
        for (const word of words) {
          if (own.includes(word)) continue;
          expect(blob, `${id} carries ${other}'s word "${word}"`).not.toMatch(
            new RegExp(`\\b${word}`),
          );
        }
      }
    }
  });

  it("keeps a details entry, in order, for every listed project", () => {
    expect(Object.keys(workspace.details)).toEqual(workspace.projects.map((p) => p.id));
  });
});
