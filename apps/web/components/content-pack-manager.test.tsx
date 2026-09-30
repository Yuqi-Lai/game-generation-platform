import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentPack } from "@/lib/types";
import { MockEventSource, realtimeEvent } from "@/test/mock-event-source";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("@/app/(app)/projects/[id]/pack-actions", () => ({
  contentPackAction: vi.fn().mockResolvedValue({}),
}));

import { ContentPackManager } from "./content-pack-manager";

const exportingPack: ContentPack = {
  id: "pack-1",
  projectId: "project-1",
  name: "Demo pack",
  status: "EXPORTING",
  items: [],
  exportJob: null,
  canEdit: false,
  canExport: false,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("ContentPackManager realtime refresh", () => {
  beforeEach(() => {
    navigation.refresh.mockReset();
    MockEventSource.install();
  });
  /*
    Explicit because vitest `globals` is off, so Testing Library registers no
    cleanup of its own. Realtime connections are cached per project at module
    scope, so a component left mounted hands the next test a live stream.
  */
  afterEach(() => {
    cleanup();
    MockEventSource.uninstall();
    vi.restoreAllMocks();
  });

  it("refreshes on pack events while SSE is healthy", async () => {
    render(<ContentPackManager projectId="project-1" packs={[exportingPack]} approvedVersions={[]} canManage={false} />);
    const source = MockEventSource.instances[0];
    act(() => source.open());
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledTimes(1));
    navigation.refresh.mockClear();

    act(() => source.emit("content.pack.updated", realtimeEvent("content.pack.updated", "project-1", "pack-1")));
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("falls back to polling for an exporting pack after disconnect", async () => {
    let poll: TimerHandler | undefined;
    vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      poll = handler;
      /* jsdom's `window.setInterval` is typed against Node's overload, which
         returns a Timeout rather than a number. */
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    const fallbackPack = { ...exportingPack, projectId: "project-fallback" };
    render(<ContentPackManager projectId="project-fallback" packs={[fallbackPack]} approvedVersions={[]} canManage={false} />);
    const source = MockEventSource.instances[0];
    act(() => source.open());
    navigation.refresh.mockClear();
    act(() => source.disconnect());
    expect(typeof poll).toBe("function");
    act(() => (poll as () => void)());
    expect(navigation.refresh).toHaveBeenCalledTimes(1);
  });

  it("opens no realtime connection or polling timer in showcase mode", () => {
    const interval = vi.spyOn(window, "setInterval");
    render(
      <ContentPackManager
        projectId="showcase-project"
        packs={[exportingPack]}
        approvedVersions={[]}
        canManage={false}
        realtimeEnabled={false}
      />,
    );
    expect(MockEventSource.instances).toHaveLength(0);
    expect(interval).not.toHaveBeenCalled();
  });
});
