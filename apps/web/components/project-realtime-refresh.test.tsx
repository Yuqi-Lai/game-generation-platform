import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockEventSource, realtimeEvent } from "@/test/mock-event-source";

const navigation = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));

import { ProjectRealtimeRefresh } from "./project-realtime-refresh";

describe("ProjectRealtimeRefresh", () => {
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
  });

  it("refetches review, version, and credit state from authoritative APIs", () => {
    render(<ProjectRealtimeRefresh projectId="project-1" />);
    const source = MockEventSource.instances[0];
    act(() => source.open());
    navigation.refresh.mockClear();

    act(() => {
      source.emit("review.updated", realtimeEvent("review.updated", "project-1"));
      source.emit("content.version.updated", realtimeEvent("content.version.updated", "project-1"));
      source.emit("credits.updated", realtimeEvent("credits.updated", "project-1"));
    });
    expect(navigation.refresh).toHaveBeenCalledTimes(3);
  });

  it("treats duplicate events as harmless refetch hints and ignores unknown events", () => {
    render(<ProjectRealtimeRefresh projectId="project-duplicates" />);
    const source = MockEventSource.instances[0];
    act(() => source.open());
    navigation.refresh.mockClear();
    const event = realtimeEvent("credits.updated", "project-duplicates");

    act(() => {
      source.emit("credits.updated", event);
      source.emit("credits.updated", event);
      source.emit("unknown.event", realtimeEvent("unknown.event", "project-duplicates"));
    });
    expect(navigation.refresh).toHaveBeenCalledTimes(2);
  });
});
