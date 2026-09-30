package com.gamegeneration.platform.generation;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gamegeneration.platform.content.ContentAsset;
import com.gamegeneration.platform.content.ContentVersion;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class GenerationApi {
	private GenerationApi() {}

	public record CreateGenerationRequest(@NotNull UUID requestId,
			@NotBlank @Size(max = 20_000) String prompt) {}
	public record RetryGenerationRequest(@NotNull UUID requestId) {}

	public record AssetResponse(String assetType, String bucket, String key, String contentType,
			long sizeBytes, String sha256, JsonNode metadata) {
		static AssetResponse from(ContentAsset asset, ObjectMapper objectMapper) {
			return new AssetResponse(asset.getAssetType(), asset.getS3Bucket(), asset.getS3Key(),
					asset.getContentType(), asset.getSizeBytes(), asset.getSha256(),
					objectMapper.readTree(asset.getMetadata()));
		}
	}

	public record ContentVersionResponse(UUID id, int versionNumber, String status, String title,
			JsonNode content, List<AssetResponse> assets, Instant createdAt) {
		static ContentVersionResponse from(ContentVersion version, List<ContentAsset> assets,
				ObjectMapper objectMapper) {
			return new ContentVersionResponse(version.getId(), version.getVersionNumber(),
					version.getStatus().name(), version.getTitle(),
					objectMapper.readTree(version.getStructuredContent()),
					assets.stream().map(asset -> AssetResponse.from(asset, objectMapper)).toList(),
					version.getCreatedAt());
		}
	}

	/**
	 * A job as it appears in a project's history list.
	 *
	 * Deliberately not {@link GenerationJobResponse}: that carries the full
	 * content version, and assembling it queries the asset table once per job,
	 * so listing a project would fan out. The list only has to identify a job
	 * and link to it, and the detail endpoint already serves the rest.
	 */
	public record GenerationJobSummaryResponse(UUID id, String status, String failureCode,
			Instant createdAt, Instant completedAt, int attemptNumber,
			UUID contentVersionId, String contentVersionTitle) {}

	public record GenerationJobResponse(UUID id, UUID projectId, String prompt, String status,
			String failureCode, String failureMessage, Instant createdAt, Instant updatedAt,
			Instant completedAt, int attemptNumber, boolean canCancel, boolean canRetry,
			ContentVersionResponse contentVersion) {}
}
