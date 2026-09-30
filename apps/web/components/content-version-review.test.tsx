import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ContentVersion } from "@/lib/types";

vi.mock("@/app/(app)/projects/[id]/content-actions", () => ({
  decideReviewAction: vi.fn(),
  submitForReviewAction: vi.fn(),
}));

import { ContentVersionReview } from "./content-version-review";

afterEach(cleanup);

function version(content: Record<string, unknown>): ContentVersion {
  return {
    id: "version-9",
    versionNumber: 2,
    status: "DRAFT",
    title: "Thaw at Saltfurrow",
    content,
    assets: [],
    createdAt: "2026-01-01T00:00:00Z",
  };
}

describe("ContentVersionReview", () => {
  /*
    The recovery path. A generation job id exists only in the URL the generate
    flow redirects to, and the platform API cannot list a project's jobs — so
    without this link a world becomes unplayable the moment that tab is closed.
  */
  it("offers a durable way back into a playable world", () => {
    render(
      <ContentVersionReview
        projectId="project-1"
        version={version({ version: "playable-game-content/v1" })}
      />,
    );

    const play = screen.getByRole("link", { name: "Play World" });
    expect(play).toHaveAttribute(
      "href",
      "/playable?manifest=" +
        encodeURIComponent("/api/projects/project-1/content-versions/version-9/manifest"),
    );
    // Addressed by version, never by job — a job id is not recoverable here.
    expect(play.getAttribute("href")).not.toContain("generations");
    expect(play).toHaveAttribute("target", "_blank");
  });

  it("offers no play action for content that is not playable v1", () => {
    render(
      <ContentVersionReview
        projectId="project-1"
        version={version({ version: "legacy-game/v0" })}
      />,
    );
    expect(screen.queryByRole("link", { name: "Play World" })).not.toBeInTheDocument();
  });

  it("uses a static playable URL when the showcase supplies one", () => {
    render(
      <ContentVersionReview
        playHref="/demo"
        projectId="molly-barnaby"
        version={version({ version: "playable-game-content/v1" })}
      />,
    );
    expect(screen.getByRole("link", { name: "Play World" })).toHaveAttribute("href", "/demo");
  });
});
