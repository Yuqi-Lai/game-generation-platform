package com.gamegeneration.platform.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class ProjectSseRegistryTest {
	private final ProjectSseRegistry registry = new ProjectSseRegistry(
			new RealtimeProperties(true, "project", 25_000, 1_800_000));

	@Test
	void fansOutToMultipleTabsAndDuplicateEventsRemainNotificationsOnly() {
		var projectId = UUID.randomUUID();
		var first = registry.connect(projectId);
		registry.connect(projectId);
		var event = RealtimeEvent.now(RealtimeEventTypes.CONTENT_PACK_UPDATED,
				projectId, UUID.randomUUID(), Map.of("status", "EXPORTING"));

		assertThat(registry.broadcast(event)).isEqualTo(2);
		assertThat(registry.broadcast(event)).isEqualTo(2);
		assertThat(registry.connectionCount(projectId)).isEqualTo(2);

		registry.disconnect(projectId, first);
		assertThat(registry.connectionCount(projectId)).isEqualTo(1);
	}
}
