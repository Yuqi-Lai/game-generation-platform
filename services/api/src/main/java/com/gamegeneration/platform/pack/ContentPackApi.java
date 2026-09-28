package com.gamegeneration.platform.pack;

import tools.jackson.databind.JsonNode;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public final class ContentPackApi {
	private ContentPackApi() {}
	public record CreatePackRequest(@NotBlank @Size(max = 200) String name) {}
	public record AddItemRequest(@NotNull UUID contentVersionId) {}
	public record StartExportRequest(@NotNull UUID requestId) {}
	public record AssetSnapshot(String assetType, String bucket, String key, String contentType,
			long sizeBytes, String sha256, Map<String, Object> metadata) {}
	public record ItemResponse(UUID id, UUID contentVersionId, int versionNumber, String title,
			String contentType, JsonNode content, JsonNode assets, Instant addedAt) {}
	public record ExportJobResponse(UUID id, String status, String artifactBucket, String artifactKey,
			String artifactUri, String contentType, Long sizeBytes, String sha256,
			String failureCode, String failureMessage, Instant createdAt, Instant startedAt, Instant completedAt) {}
	public record PackResponse(UUID id, UUID projectId, String name, String status,
			List<ItemResponse> items, ExportJobResponse exportJob, boolean canEdit, boolean canExport,
			Instant createdAt, Instant updatedAt) {}
}
