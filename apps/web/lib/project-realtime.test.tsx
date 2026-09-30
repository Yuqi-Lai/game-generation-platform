import { act, cleanup, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useProjectRealtime } from "./project-realtime";
import { MockEventSource, realtimeEvent } from "@/test/mock-event-source";

function Probe({ projectId, label }: { projectId: string; label: string }) {
  const realtime = useProjectRealtime(projectId);
  return <output>{label}:{realtime.status}:{realtime.connectionEpoch}</output>;
}

/** Records which events actually reach a subscriber. */
function EventProbe({ projectId }: { projectId: string }) {
  const { subscribe, status } = useProjectRealtime(projectId);
  const [seen, setSeen] = useState<string[]>([]);
  useEffect(() => subscribe((event) => setSeen((all) => [...all, event.entityId])), [subscribe]);
  return <output>{status}|{seen.join(",")}</output>;
}

describe("useProjectRealtime", () => {
  beforeEach(() => MockEventSource.install());
  /*
    `cleanup` is explicit because vitest `globals` is off, so Testing Library
    never registers its own hook. Connections are cached per project at module
    scope, so a component left mounted would hand the next test a live stream.
  */
  afterEach(() => {
    cleanup();
    MockEventSource.uninstall();
  });

  it("shares one EventSource per active project and tracks reconnects", () => {
    const view = render(<><Probe projectId="project-1" label="a" /><Probe projectId="project-1" label="b" /></>);
    expect(MockEventSource.instances).toHaveLength(1);
    expect(MockEventSource.instances[0].url).toBe("/api/projects/project-1/events");

    act(() => MockEventSource.instances[0].open());
    expect(screen.getByText("a:connected:1")).toBeInTheDocument();
    expect(screen.getByText("b:connected:1")).toBeInTheDocument();

    act(() => MockEventSource.instances[0].disconnect());
    expect(screen.getByText("a:reconnecting:1")).toBeInTheDocument();
    act(() => MockEventSource.instances[0].open());
    expect(screen.getByText("a:connected:2")).toBeInTheDocument();

    view.unmount();
    expect(MockEventSource.instances[0].readyState).toBe(MockEventSource.CLOSED);
  });

  it("ignores unknown and malformed events", () => {
    render(<Probe projectId="project-1" label="safe" />);
    const source = MockEventSource.instances[0];
    act(() => {
      source.emit("unknown.event", realtimeEvent("unknown.event", "project-1"));
      source.emit("generation.job.updated", { broken: true });
    });
    expect(screen.getByText("safe:reconnecting:0")).toBeInTheDocument();
  });

  it("reports disconnected only once the stream is closed for good", () => {
    render(<Probe projectId="project-1" label="p" />);
    const source = MockEventSource.instances[0];

    act(() => source.open());
    expect(screen.getByText("p:connected:1")).toBeInTheDocument();

    // A retryable drop is still reconnecting, so the UI keeps saying so.
    act(() => source.disconnect());
    expect(screen.getByText("p:reconnecting:1")).toBeInTheDocument();

    act(() => source.disconnect(true));
    expect(screen.getByText("p:disconnected:1")).toBeInTheDocument();
  });

  it("opens one stream per project, not one per subscriber", () => {
    render(<><Probe projectId="project-a" label="a" /><Probe projectId="project-b" label="b" /></>);

    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances.map((source) => source.url)).toEqual([
      "/api/projects/project-a/events",
      "/api/projects/project-b/events",
    ]);
  });

  it("opens a fresh stream after the last subscriber for a project leaves", () => {
    /*
      Releasing the last subscriber has to leave the next mount able to open a
      working stream. The implementation gets there two redundant ways — it
      nulls the source and drops the cached connection — so this asserts the
      outcome rather than either mechanism.
    */
    render(<Probe projectId="project-1" label="first" />).unmount();
    expect(MockEventSource.instances).toHaveLength(1);

    render(<Probe projectId="project-1" label="second" />);
    expect(MockEventSource.instances).toHaveLength(2);
    expect(MockEventSource.instances[1].readyState).not.toBe(MockEventSource.CLOSED);
  });

  it("rejects events addressed to a different project", () => {
    render(<EventProbe projectId="project-1" />);
    const source = MockEventSource.instances[0];

    act(() => {
      source.emit("generation.job.updated", realtimeEvent("generation.job.updated", "project-1", "mine"));
      source.emit("generation.job.updated", realtimeEvent("generation.job.updated", "project-2", "theirs"));
    });

    expect(screen.getByText("reconnecting|mine")).toBeInTheDocument();
  });
});
