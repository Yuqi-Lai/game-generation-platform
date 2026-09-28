package com.gamegeneration.platform.review;

import tools.jackson.databind.JsonNode;
import com.gamegeneration.platform.content.ContentAsset;
import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.user.AppUser;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ContentReviewApi {
	private ContentReviewApi() {}

	public record SubmitReviewRequest(@NotNull UUID requestId) {}
	public record DecisionRequest(@NotNull UUID requestId, @Size(max = 5_000) String comment) {}

	public record AssetResponse(String assetType, String bucket, String key, String contentType,
			long sizeBytes, String sha256, JsonNode metadata) {}

	public record DecisionResponse(UUID id, UUID reviewerId, String reviewerName, String reviewerEmail,
			String decision, String comment, Instant createdAt, Instant decidedAt) {}

	public record AssignmentResponse(UUID reviewerId, String reviewerName, String reviewerEmail,
			DecisionResponse decision) {}

	public record ReviewRequestResponse(UUID id, UUID contentVersionId, int requestNumber,
			String status, UUID requestedById, Instant createdAt, Instant decidedAt,
			List<AssignmentResponse> reviewers) {}

	public record ReviewStatusResponse(UUID contentVersionId, String contentVersionStatus,
			ReviewRequestResponse reviewRequest) {}

	public record ContentVersionResponse(UUID id, UUID projectId, int versionNumber, String status,
			String title, JsonNode content, List<AssetResponse> assets, Instant createdAt,
			Instant updatedAt, ReviewRequestResponse reviewRequest,
			boolean canSubmitForReview, boolean canDecide) {}

	static String displayName(AppUser user) {
		return user.getDisplayName() == null || user.getDisplayName().isBlank()
				? user.getEmail() : user.getDisplayName();
	}
}
