"use client";

import { useCallback, useSyncExternalStore } from "react";

export const PROJECT_REALTIME_EVENT_TYPES = [
  "generation.job.updated",
  "content.version.updated",
  "review.updated",
  "content.pack.updated",
  "credits.updated",
] as const;

export type ProjectRealtimeEventType = (typeof PROJECT_REALTIME_EVENT_TYPES)[number];
export type ProjectRealtimeStatus = "connected" | "reconnecting" | "disconnected";

export interface ProjectRealtimeEvent {
  schemaVersion: number;
  eventType: ProjectRealtimeEventType;
  projectId: string;
  entityId: string;
  timestamp: string;
  status: Record<string, unknown>;
}

type EventListener = (event: ProjectRealtimeEvent) => void;
type StateListener = () => void;
interface Snapshot {
  status: ProjectRealtimeStatus;
  connectionEpoch: number;
}

const DISCONNECTED_SNAPSHOT: Snapshot = { status: "disconnected", connectionEpoch: 0 };

class ProjectConnection {
  private source: EventSource | null = null;
  private eventListeners = new Set<EventListener>();
  private stateListeners = new Set<StateListener>();
  private snapshot: Snapshot = DISCONNECTED_SNAPSHOT;

  constructor(private readonly projectId: string, private readonly onUnused: () => void) {}

  getSnapshot = () => this.snapshot;

  subscribeState = (listener: StateListener) => {
    this.stateListeners.add(listener);
    this.ensureConnected();
    return () => {
      this.stateListeners.delete(listener);
      this.closeIfUnused();
    };
  };

  subscribeEvents = (listener: EventListener) => {
    this.eventListeners.add(listener);
    this.ensureConnected();
    return () => {
      this.eventListeners.delete(listener);
      this.closeIfUnused();
    };
  };

  private ensureConnected() {
    if (this.source || typeof EventSource === "undefined") return;
    this.update({ status: "reconnecting", connectionEpoch: this.snapshot.connectionEpoch });
    const source = new EventSource(`/api/projects/${encodeURIComponent(this.projectId)}/events`);
    this.source = source;
    source.onopen = () => {
      this.update({ status: "connected", connectionEpoch: this.snapshot.connectionEpoch + 1 });
    };
    source.onerror = () => {
      const status = source.readyState === EventSource.CLOSED ? "disconnected" : "reconnecting";
      this.update({ status, connectionEpoch: this.snapshot.connectionEpoch });
    };
    for (const eventType of PROJECT_REALTIME_EVENT_TYPES) {
      source.addEventListener(eventType, (message) => this.receive(message, eventType));
    }
  }

  private receive(message: MessageEvent, expectedType: ProjectRealtimeEventType) {
    try {
      const event = JSON.parse(message.data) as Partial<ProjectRealtimeEvent>;
      if (
        event.schemaVersion !== 1 ||
        event.eventType !== expectedType ||
        event.projectId !== this.projectId ||
        typeof event.entityId !== "string"
      ) return;
      for (const listener of this.eventListeners) listener(event as ProjectRealtimeEvent);
    } catch {
      // Realtime is a hint. Malformed or unknown messages are safely ignored.
    }
  }

  private update(snapshot: Snapshot) {
    if (
      snapshot.status === this.snapshot.status &&
      snapshot.connectionEpoch === this.snapshot.connectionEpoch
    ) return;
    this.snapshot = snapshot;
    for (const listener of this.stateListeners) listener();
  }

  private closeIfUnused() {
    if (this.stateListeners.size || this.eventListeners.size) return;
    this.source?.close();
    this.source = null;
    this.snapshot = DISCONNECTED_SNAPSHOT;
    this.onUnused();
  }
}

const connections = new Map<string, ProjectConnection>();

function connectionFor(projectId: string) {
  let connection = connections.get(projectId);
  if (!connection) {
    connection = new ProjectConnection(projectId, () => connections.delete(projectId));
    connections.set(projectId, connection);
  }
  return connection;
}

export function useProjectRealtime(projectId: string, enabled = true) {
  const connection = typeof window === "undefined" || !enabled ? null : connectionFor(projectId);
  const snapshot = useSyncExternalStore(
    connection?.subscribeState ?? (() => () => undefined),
    connection?.getSnapshot ?? (() => DISCONNECTED_SNAPSHOT),
    () => DISCONNECTED_SNAPSHOT,
  );
  const subscribe = useCallback(
    (listener: EventListener) => connection?.subscribeEvents(listener) ?? (() => undefined),
    [connection],
  );

  return {
    connected: snapshot.status === "connected",
    connectionEpoch: snapshot.connectionEpoch,
    status: snapshot.status,
    subscribe,
  };
}
