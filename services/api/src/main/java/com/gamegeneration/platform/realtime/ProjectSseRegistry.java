package com.gamegeneration.platform.realtime;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@Component
public class ProjectSseRegistry {
	private final RealtimeProperties properties;
	private final ConcurrentHashMap<UUID, ConcurrentHashMap<UUID, SseEmitter>> emitters = new ConcurrentHashMap<>();

	public ProjectSseRegistry(RealtimeProperties properties) {
		this.properties = properties;
	}

	public SseEmitter connect(UUID projectId) {
		UUID connectionId = UUID.randomUUID();
		var emitter = new SseEmitter(properties.connectionTimeoutMs());
		emitters.computeIfAbsent(projectId, ignored -> new ConcurrentHashMap<>()).put(connectionId, emitter);
		emitter.onCompletion(() -> remove(projectId, connectionId));
		emitter.onTimeout(() -> remove(projectId, connectionId));
		emitter.onError(ignored -> remove(projectId, connectionId));
		try {
			emitter.send(SseEmitter.event().name("connected").data(Map.of(
					"schemaVersion", 1,
					"projectId", projectId,
					"timestamp", Instant.now())));
		} catch (IOException exception) {
			remove(projectId, connectionId);
			emitter.completeWithError(exception);
		}
		return emitter;
	}

	public int broadcast(RealtimeEvent event) {
		var projectConnections = emitters.get(event.projectId());
		if (projectConnections == null) return 0;
		int delivered = 0;
		for (var entry : projectConnections.entrySet()) {
			try {
				entry.getValue().send(SseEmitter.event().name(event.eventType()).id(event.timestamp().toString()).data(event));
				delivered++;
			} catch (IOException | IllegalStateException exception) {
				remove(event.projectId(), entry.getKey());
			}
		}
		return delivered;
	}

	@Scheduled(fixedDelayString = "${app.realtime.heartbeat-interval-ms:25000}")
	public void heartbeat() {
		for (var project : emitters.entrySet()) {
			for (var connection : project.getValue().entrySet()) {
				try {
					connection.getValue().send(SseEmitter.event().name("heartbeat").comment("keepalive")
							.data(Map.of("timestamp", Instant.now())));
				} catch (IOException | IllegalStateException exception) {
					remove(project.getKey(), connection.getKey());
				}
			}
		}
	}

	void remove(UUID projectId, UUID connectionId) {
		var projectConnections = emitters.get(projectId);
		if (projectConnections == null) return;
		projectConnections.remove(connectionId);
		if (projectConnections.isEmpty()) emitters.remove(projectId, projectConnections);
	}

	int connectionCount(UUID projectId) {
		var projectConnections = emitters.get(projectId);
		return projectConnections == null ? 0 : projectConnections.size();
	}

	void disconnect(UUID projectId, SseEmitter emitter) {
		var projectConnections = emitters.get(projectId);
		if (projectConnections == null) return;
		projectConnections.entrySet().stream()
				.filter(entry -> entry.getValue() == emitter)
				.map(Map.Entry::getKey)
				.findFirst()
				.ifPresent(connectionId -> remove(projectId, connectionId));
	}
}
