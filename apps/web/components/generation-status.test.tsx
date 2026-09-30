import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationStatus } from "./generation-status";
import type { GenerationJob } from "@/lib/types";
import { MockEventSource, realtimeEvent } from "@/test/mock-event-source";

/*
  This project does not enable vitest `globals`, so Testing Library's automatic
  cleanup hook never registers. Without this, mounted components keep their
  realtime subscription and the module-level connection map hands the next test
  an already-open EventSource instead of a fresh one.
*/
afterEach(cleanup);

const runningJob: GenerationJob = {
  id: "job-realtime",
  projectId: "project-realtime",
  prompt: "Create a synthetic quest.",
  status: "RUNNING",
  failureCode: null,
  failureMessage: null,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:01:00Z",
  completedAt: null,
  attemptNumber: 1,
  canCancel: true,
  canRetry: false,
  contentVersion: null,
};

describe("GenerationStatus", () => {
  it("renders the completed DRAFT version and stored assets", () => {
    render(<GenerationStatus initialJob={{
      id: "job-1",
      projectId: "project-1",
      prompt: "Create a synthetic quest.",
      status: "SUCCEEDED",
      failureCode: null,
      failureMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:01:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      attemptNumber: 1,
      canCancel: false,
      canRetry: false,
      contentVersion: {
        id: "version-1",
        versionNumber: 1,
        status: "DRAFT",
        title: "Synthetic Quest",
        content: {
          version: "playable-game-content/v1",
          synopsis: "An original safe fixture.",
          scenes: [{ title: "Workshop" }],
        },
        createdAt: "2026-01-01T00:01:00Z",
        assets: [{
          assetType: "CONTENT_JSON",
          bucket: "test-bucket",
          key: "synthetic/content.json",
          contentType: "application/json",
          sizeBytes: 42,
          sha256: "a".repeat(64),
          metadata: {},
        }],
      },
    }} />);

    expect(screen.getByText("DRAFT")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Synthetic Quest" })).toBeInTheDocument();
    expect(screen.getByText("s3://test-bucket/synthetic/content.json")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play World" })).toHaveAttribute(
      "href",
      "/playable?manifest=%2Fapi%2Fprojects%2Fproject-1%2Fgenerations%2Fjob-1%2Fmanifest",
    );
    expect(screen.getByRole("link", { name: "Open in Studio" })).toHaveAttribute(
      "href",
      "/projects/project-1",
    );
  });

  it("offers cancellation while a job is running", () => {
    render(<GenerationStatus initialJob={{
      id: "job-2",
      projectId: "project-1",
      prompt: "Create a synthetic quest.",
      status: "RUNNING",
      failureCode: null,
      failureMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:01:00Z",
      completedAt: null,
      attemptNumber: 1,
      canCancel: true,
      canRetry: false,
      contentVersion: null,
    }} />);

    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel generation" })).toBeInTheDocument();
  });

  it("shows a readable failure and a retry action", () => {
    render(<GenerationStatus initialJob={{
      id: "job-3",
      projectId: "project-1",
      prompt: "Create a synthetic quest.",
      status: "FAILED",
      failureCode: "PROVIDER_INVALID_REQUEST",
      failureMessage: "The provider rejected the request.",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:01:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      attemptNumber: 1,
      canCancel: false,
      canRetry: true,
      contentVersion: null,
    }} />);

    expect(screen.getByText("The provider rejected the request.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry generation" })).toBeInTheDocument();
  });
});

describe("GenerationStatus realtime refresh", () => {
  beforeEach(() => {
    MockEventSource.install();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(runningJob), {
      headers: { "Content-Type": "application/json" },
    })));
  });

  afterEach(() => {
    MockEventSource.uninstall();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refetches the matching job on generation events and after reconnect", async () => {
    render(<GenerationStatus initialJob={runningJob} />);
    const source = MockEventSource.instances[0];

    act(() => source.open());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    vi.mocked(fetch).mockClear();

    act(() => source.emit(
      "generation.job.updated",
      realtimeEvent("generation.job.updated", runningJob.projectId, runningJob.id),
    ));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    vi.mocked(fetch).mockClear();
    act(() => source.disconnect());
    act(() => source.open());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  });

  it("never derives job state from the event payload", async () => {
    /*
      The stream is a hint, not a source of truth. An event that claims the job
      finished must still send the page back to the PostgreSQL-backed API, which
      here keeps reporting RUNNING.
    */
    render(<GenerationStatus initialJob={runningJob} />);
    const source = MockEventSource.instances[0];

    act(() => source.open());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    vi.mocked(fetch).mockClear();

    act(() => source.emit("generation.job.updated", {
      ...realtimeEvent("generation.job.updated", runningJob.projectId, runningJob.id),
      status: { status: "SUCCEEDED", contentVersion: { title: "Phantom version" } },
    }));

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.queryByText("Phantom version")).not.toBeInTheDocument();
  });

  it("ignores generation events addressed to another job", async () => {
    render(<GenerationStatus initialJob={runningJob} />);
    const source = MockEventSource.instances[0];

    act(() => source.open());
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    vi.mocked(fetch).mockClear();

    act(() => source.emit(
      "generation.job.updated",
      realtimeEvent("generation.job.updated", runningJob.projectId, "a-different-job"),
    ));

    await Promise.resolve();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops the two-second poll while the stream is healthy", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      render(<GenerationStatus initialJob={runningJob} />);
      const source = MockEventSource.instances[0];

      act(() => source.open());
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
      vi.mocked(fetch).mockClear();

      // Ten seconds of a healthy stream is five polls that must not happen.
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(fetch).not.toHaveBeenCalled();

      // Losing the stream puts the fallback back in play.
      act(() => source.disconnect());
      await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
      expect(fetch).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("restores two-second polling while SSE is disconnected", async () => {
    const fallbackJob = { ...runningJob, id: "job-fallback", projectId: "project-fallback" };
    let poll: TimerHandler | undefined;
    vi.spyOn(window, "setInterval").mockImplementation((handler) => {
      poll = handler;
      /* jsdom's `window.setInterval` is typed against Node's overload, which
         returns a Timeout rather than a number. */
      return 1 as unknown as ReturnType<typeof window.setInterval>;
    });
    render(<GenerationStatus initialJob={fallbackJob} />);
    const source = MockEventSource.instances[0];
    act(() => source.open());
    await act(async () => { await Promise.resolve(); });
    vi.mocked(fetch).mockClear();

    act(() => source.disconnect());
    expect(typeof poll).toBe("function");
    await act(async () => { (poll as () => void)(); await Promise.resolve(); });

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
