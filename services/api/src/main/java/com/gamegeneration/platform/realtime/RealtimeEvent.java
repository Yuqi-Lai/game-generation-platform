package com.gamegeneration.platform.realtime;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

public record RealtimeEvent(
		int schemaVersion,
		String eventType,
		UUID projectId,
		UUID entityId,
		Instant timestamp,
		Map<String, Object> status) {

	public static RealtimeEvent now(String eventType, UUID projectId, UUID entityId,
			Map<String, Object> status) {
		return new RealtimeEvent(1, eventType, projectId, entityId, Instant.now(), Map.copyOf(status));
	}
}
