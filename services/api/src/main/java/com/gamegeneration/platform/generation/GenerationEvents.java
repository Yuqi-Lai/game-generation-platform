package com.gamegeneration.platform.generation;

import tools.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class GenerationEvents {
	private GenerationEvents() {}

	public static final String REQUESTED = "GenerationExecutionRequested";
	public static final String STARTED = "GenerationExecutionStarted";
	public static final String SUCCEEDED = "GenerationExecutionSucceeded";
	public static final String FAILED = "GenerationExecutionFailed";
	public static final String DEAD_LETTERED = "GenerationExecutionDeadLettered";

	public record Requested(
			UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID jobId, UUID attemptId, UUID executionKey, UUID projectId,
			int attemptNumber, String prompt, String outputPrefix) {}

	public record Started(
			UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID jobId, UUID attemptId, UUID executionKey, String workerExecutionId) {}

	public record Asset(
			String assetType, String bucket, String key, String contentType,
			long sizeBytes, String sha256, JsonNode metadata) {}

	public record Succeeded(
			UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID jobId, UUID attemptId, UUID executionKey, String provider,
			String model, String workerExecutionId, String title, JsonNode content, List<Asset> assets) {}

	public record Failed(
			UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID jobId, UUID attemptId, UUID executionKey, String provider,
			String model, String workerExecutionId, String failureCode,
			String failureMessage, boolean retryable) {}

	public record DeadLettered(
			UUID eventId, String eventType, int schemaVersion, Instant occurredAt,
			UUID jobId, UUID attemptId, UUID executionKey, int attemptNumber,
			String failureCode, String failureMessage) {}
}
