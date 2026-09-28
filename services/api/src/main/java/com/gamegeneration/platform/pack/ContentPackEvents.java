package com.gamegeneration.platform.pack;

import tools.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ContentPackEvents {
	private ContentPackEvents() {}
	public static final String REQUESTED = "ContentPackExportRequested";
	public static final String STARTED = "ContentPackExportStarted";
	public static final String SUCCEEDED = "ContentPackExportSucceeded";
	public static final String FAILED = "ContentPackExportFailed";

	public record Item(UUID contentVersionId, int versionNumber, String title,
			String contentType, JsonNode content, JsonNode assets) {}
	public record Requested(UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID exportJobId, UUID packId, UUID projectId, UUID executionKey,
			String artifactBucket, String artifactKey, List<Item> items) {}
	public record Started(UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID exportJobId, UUID packId, UUID executionKey, String workerExecutionId) {}
	public record Succeeded(UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID exportJobId, UUID packId, UUID executionKey, String workerExecutionId,
			String artifactBucket, String artifactKey, String contentType, long sizeBytes, String sha256) {}
	public record Failed(UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID exportJobId, UUID packId, UUID executionKey, String workerExecutionId,
			String failureCode, String failureMessage) {}
}
