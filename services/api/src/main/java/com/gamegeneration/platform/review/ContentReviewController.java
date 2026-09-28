package com.gamegeneration.platform.review;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/content-versions")
public class ContentReviewController {
	private final AuthenticatedUserService authenticatedUsers;
	private final ContentReviewService reviews;

	public ContentReviewController(AuthenticatedUserService authenticatedUsers, ContentReviewService reviews) {
		this.authenticatedUsers = authenticatedUsers;
		this.reviews = reviews;
	}

	@GetMapping
	public List<ContentReviewApi.ContentVersionResponse> list(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId) {
		return reviews.listVersions(authenticatedUsers.resolve(jwt), projectId);
	}

	@GetMapping("/{versionId}")
	public ContentReviewApi.ContentVersionResponse get(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID versionId) {
		return reviews.getVersion(authenticatedUsers.resolve(jwt), projectId, versionId);
	}

	@GetMapping("/{versionId}/review")
	public ContentReviewApi.ReviewStatusResponse review(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID versionId) {
		return reviews.getReview(authenticatedUsers.resolve(jwt), projectId, versionId);
	}

	@PostMapping("/{versionId}/review-requests")
	public ContentReviewApi.ReviewStatusResponse submit(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID versionId,
			@Valid @RequestBody ContentReviewApi.SubmitReviewRequest request) {
		return reviews.submit(authenticatedUsers.resolve(jwt), projectId, versionId, request);
	}

	@PostMapping("/{versionId}/review-requests/{reviewRequestId}/approve")
	public ContentReviewApi.ReviewStatusResponse approve(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID versionId, @PathVariable UUID reviewRequestId,
			@Valid @RequestBody ContentReviewApi.DecisionRequest request) {
		return reviews.decide(authenticatedUsers.resolve(jwt), projectId, versionId,
				reviewRequestId, ReviewDecisionType.APPROVE, request);
	}

	@PostMapping("/{versionId}/review-requests/{reviewRequestId}/request-changes")
	public ContentReviewApi.ReviewStatusResponse requestChanges(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID versionId, @PathVariable UUID reviewRequestId,
			@Valid @RequestBody ContentReviewApi.DecisionRequest request) {
		return reviews.decide(authenticatedUsers.resolve(jwt), projectId, versionId,
				reviewRequestId, ReviewDecisionType.REQUEST_CHANGES, request);
	}
}
