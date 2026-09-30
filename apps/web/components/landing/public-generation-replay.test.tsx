import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PublicGenerationReplay from "./public-generation-replay";
import type { GenerationJob } from "@/lib/types";

const manifest = {
  title: "The Witch's Tide and Golden Sight",
  version: "playable-game-content/v1",
  openingRemarks: "A validated showcase world.",
  scenes: [{ id: "coast" }],
  assets: [
    {
      id: "player.stand",
      role: "PLAYER_STAND",
      width: 128,
      height: 128,
      sha256: "a".repeat(64),
      objectKey: "/demo/assets/player/stand.png",
      contentType: "image/png",
    },
    {
      id: "scene.coast.background",
      role: "SCENE_BACKGROUND",
      width: 2560,
      height: 1440,
      sha256: "b".repeat(64),
      objectKey: "/demo/assets/scenes/scene-coastal-farm/background.png",
      contentType: "image/png",
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PublicGenerationReplay", () => {
  it("streams the static demo assets into the existing result UI and finishes at /demo", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(manifest), {
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const completedJob: GenerationJob = {
      id: "molly-barnaby-showcase",
      projectId: "molly-barnaby",
      prompt: "A static showcase prompt.",
      status: "SUCCEEDED",
      failureCode: null,
      failureMessage: null,
      createdAt: "2026-09-30T15:34:00Z",
      updatedAt: "2026-09-30T15:42:00Z",
      completedAt: "2026-09-30T15:42:00Z",
      attemptNumber: 1,
      canCancel: false,
      canRetry: false,
      contentVersion: {
        id: "molly-version-2",
        projectId: "molly-barnaby",
        versionNumber: 2,
        status: "DRAFT",
        title: "The Potion of Golden Sight",
        content: { version: "playable-game-content/v1" },
        assets: [],
        createdAt: "2026-09-30T15:42:00Z",
      },
    };

    render(<PublicGenerationReplay completedJob={completedJob} />);
    await act(async () => { await Promise.resolve(); });

    expect(fetchMock).toHaveBeenCalledWith("/demo/manifest.json", { cache: "force-cache" });
    expect(screen.getByText("QUEUED")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByText("stand")).toBeInTheDocument();

    await act(async () => { await vi.advanceTimersByTimeAsync(7_100); });
    expect(screen.getByText("SUCCEEDED")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "The Witch's Tide and Golden Sight" }))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play World" })).toHaveAttribute("href", "/demo");
    expect(screen.getByRole("link", { name: "Open in Studio" })).toHaveAttribute(
      "href",
      "/projects/molly-barnaby",
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toMatch(/^\/api\//);
  });
});
