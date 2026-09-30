"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useProjectRealtime } from "@/lib/project-realtime";

export function ProjectRealtimeRefresh({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { connectionEpoch, subscribe } = useProjectRealtime(projectId);

  useEffect(() => subscribe((event) => {
    if (
      event.eventType === "review.updated" ||
      event.eventType === "content.version.updated" ||
      event.eventType === "credits.updated"
    ) router.refresh();
  }), [subscribe, router]);

  useEffect(() => {
    if (connectionEpoch > 0) router.refresh();
  }, [connectionEpoch, router]);

  return null;
}
