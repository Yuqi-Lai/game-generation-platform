package com.gamegeneration.platform.review;

import tools.jackson.databind.ObjectMapper;
import com.gamegeneration.platform.content.ContentAssetRepository;
import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.content.ContentVersionRepository;
import com.gamegeneration.platform.content.ContentVersionStatus;
import com.gamegeneration.platform.membership.ProjectMembership;
import com.gamegeneration.platform.membership.ProjectMembershipId;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.project.ProjectRepository;
import com.gamegeneration.platform.project.ProjectRole;
import com.gamegeneration.platform.project.ProjectStatus;
import com.gamegeneration.platform.shared.ConflictException;
import com.gamegeneration.platform.shared.ForbiddenException;
import com.gamegeneration.platform.shared.NotFoundException;
import com.gamegeneration.platform.user.AppUser;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContentReviewService {
	private final ProjectRepository projects;
	private final ProjectMembershipRepository memberships;
	private final ContentVersionRepository versions;
	private final ContentAssetRepository assets;
	private final ReviewRequestRepository requests;
	private final ReviewAssignmentRepository assignments;
	private final ReviewDecisionRepository decisions;
	private final ObjectMapper objectMapper;

	public ContentReviewService(ProjectRepository projects, ProjectMembershipRepository memberships,
			ContentVersionRepository versions, ContentAssetRepository assets,
			ReviewRequestRepository requests, ReviewAssignmentRepository assignments,
			ReviewDecisionRepository decisions, ObjectMapper objectMapper) {
		this.projects = projects;
		this.memberships = memberships;
		this.versions = versions;
		this.assets = assets;
		this.requests = requests;
		this.assignments = assignments;
		this.decisions = decisions;
		this.objectMapper = objectMapper;
	}

	@Transactional(readOnly = true)
	public List<ContentReviewApi.ContentVersionResponse> listVersions(AppUser actor, UUID projectId) {
		var membership = requireMember(actor, projectId);
		return versions.findAllByProjectIdOrderByVersionNumberDesc(projectId).stream()
				.map(version -> versionResponse(version, membership)).toList();
	}

	@Transactional(readOnly = true)
	public ContentReviewApi.ContentVersionResponse getVersion(AppUser actor, UUID projectId, UUID versionId) {
		var membership = requireMember(actor, projectId);
		return versionResponse(requireVersion(projectId, versionId), membership);
	}

	@Transactional(readOnly = true)
	public ContentReviewApi.ReviewStatusResponse getReview(AppUser actor, UUID projectId, UUID versionId) {
		requireMember(actor, projectId);
		var version = requireVersion(projectId, versionId);
		var request = requests.findFirstByContentVersionIdOrderByRequestNumberDesc(versionId).orElse(null);
		return new ContentReviewApi.ReviewStatusResponse(versionId, version.getStatus().name(),
				request == null ? null : reviewResponse(request));
	}

	@Transactional
	public ContentReviewApi.ReviewStatusResponse submit(AppUser actor, UUID projectId, UUID versionId,
			ContentReviewApi.SubmitReviewRequest command) {
		requireSubmitter(actor, projectId);
		var project = projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		if (project.getStatus() != ProjectStatus.ACTIVE) throw new ConflictException("Archived projects cannot be reviewed");
		var version = requireVersionForUpdate(projectId, versionId);
		var repeated = requests.findByContentVersionIdAndSubmitIdempotencyKey(versionId, command.requestId());
		if (repeated.isPresent()) return statusResponse(version, repeated.get());
		if (version.getStatus() == ContentVersionStatus.IN_REVIEW) {
			var active = requests.findByVersionAndStatusForUpdate(versionId, ReviewRequestStatus.OPEN)
					.orElseThrow(() -> new ConflictException("Review state is inconsistent"));
			return statusResponse(version, active);
		}
		if (version.getStatus() != ContentVersionStatus.DRAFT
				&& version.getStatus() != ContentVersionStatus.CHANGES_REQUESTED) {
			throw new ConflictException("Only draft or changes-requested versions can be submitted for review");
		}
		var reviewers = memberships.findAllByIdProjectIdAndRoleOrderByCreatedAtAsc(projectId, ProjectRole.REVIEWER);
		if (reviewers.isEmpty()) throw new ConflictException("Assign at least one REVIEWER before submitting");
		var request = requests.saveAndFlush(new ReviewRequest(version,
				requests.findMaxRequestNumber(versionId) + 1, actor, command.requestId()));
		for (var reviewer : reviewers) {
			assignments.save(new ReviewAssignment(request, version, reviewer.getUser()));
		}
		version.submitForReview();
		return statusResponse(version, request);
	}

	@Transactional
	public ContentReviewApi.ReviewStatusResponse decide(AppUser actor, UUID projectId, UUID versionId,
			UUID requestId, ReviewDecisionType decisionType, ContentReviewApi.DecisionRequest command) {
		requireReviewer(actor, projectId);
		projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		var version = requireVersionForUpdate(projectId, versionId);
		var request = requests.findForUpdate(requestId)
				.orElseThrow(() -> new NotFoundException("Review request not found"));
		if (!request.getContentVersion().getId().equals(versionId)) {
			throw new NotFoundException("Review request not found");
		}
		var repeated = decisions.findByReviewerIdAndRequestIdempotencyKey(actor.getId(), command.requestId());
		if (repeated.isPresent()) {
			if (!repeated.get().getReviewRequest().getId().equals(requestId)) {
				throw new ConflictException("Decision idempotency key was already used");
			}
			return statusResponse(version, request);
		}
		var assignment = assignments.findByReviewRequestIdAndReviewerId(requestId, actor.getId())
				.orElseThrow(() -> new ForbiddenException("You are not assigned to this review request"));
		if (decisions.findByReviewRequestIdAndReviewerId(requestId, actor.getId()).isPresent()) {
			return statusResponse(version, request);
		}
		if (request.getStatus() != ReviewRequestStatus.OPEN
				|| version.getStatus() != ContentVersionStatus.IN_REVIEW) {
			throw new ConflictException("This review request is no longer active");
		}
		decisions.saveAndFlush(new ReviewDecision(assignment, decisionType,
				normalized(command.comment()), command.requestId()));
		if (decisionType == ReviewDecisionType.REQUEST_CHANGES) {
			request.requestChanges();
			version.requestChanges();
		} else if (decisions.countByReviewRequestIdAndDecision(requestId, ReviewDecisionType.APPROVE)
				== assignments.countByReviewRequestId(requestId)) {
			request.approve();
			version.approve();
		}
		return statusResponse(version, request);
	}

	@Transactional(propagation = Propagation.MANDATORY)
	public void supersedeOpenReviews(UUID projectId) {
		for (var version : versions.findAllByProjectIdAndStatusForUpdate(projectId, ContentVersionStatus.IN_REVIEW)) {
			var request = requests.findByVersionAndStatusForUpdate(version.getId(), ReviewRequestStatus.OPEN)
					.orElseThrow(() -> new IllegalStateException("IN_REVIEW version has no open review request"));
			request.supersede();
			version.supersede();
		}
	}

	private ContentReviewApi.ContentVersionResponse versionResponse(
			ContentVersion version, ProjectMembership membership) {
		var request = requests.findFirstByContentVersionIdOrderByRequestNumberDesc(version.getId()).orElse(null);
		boolean canSubmit = (membership.getRole() == ProjectRole.OWNER || membership.getRole() == ProjectRole.EDITOR)
				&& (version.getStatus() == ContentVersionStatus.DRAFT
				|| version.getStatus() == ContentVersionStatus.CHANGES_REQUESTED);
		boolean canDecide = request != null && request.getStatus() == ReviewRequestStatus.OPEN
				&& membership.getRole() == ProjectRole.REVIEWER
				&& assignments.findByReviewRequestIdAndReviewerId(request.getId(), membership.getUser().getId()).isPresent()
				&& decisions.findByReviewRequestIdAndReviewerId(request.getId(), membership.getUser().getId()).isEmpty();
		return new ContentReviewApi.ContentVersionResponse(version.getId(), version.getProject().getId(),
				version.getVersionNumber(), version.getStatus().name(), version.getTitle(),
				objectMapper.readTree(version.getStructuredContent()),
				assets.findAllByContentVersionIdOrderByCreatedAtAsc(version.getId()).stream()
						.map(asset -> new ContentReviewApi.AssetResponse(asset.getAssetType(), asset.getS3Bucket(),
								asset.getS3Key(), asset.getContentType(), asset.getSizeBytes(), asset.getSha256(),
								objectMapper.readTree(asset.getMetadata()))).toList(),
				version.getCreatedAt(), version.getUpdatedAt(), request == null ? null : reviewResponse(request),
				canSubmit, canDecide);
	}

	private ContentReviewApi.ReviewRequestResponse reviewResponse(ReviewRequest request) {
		var byReviewer = decisions.findAllByReviewRequestIdOrderByCreatedAtAsc(request.getId()).stream()
				.collect(java.util.stream.Collectors.toMap(decision -> decision.getReviewer().getId(), decision -> decision));
		var reviewerResponses = assignments.findAllByReviewRequestIdOrderByCreatedAtAsc(request.getId()).stream()
				.map(assignment -> {
					var reviewer = assignment.getReviewer();
					var decision = byReviewer.get(reviewer.getId());
					return new ContentReviewApi.AssignmentResponse(reviewer.getId(),
							ContentReviewApi.displayName(reviewer), reviewer.getEmail(),
							decision == null ? null : decisionResponse(decision));
				}).toList();
		return new ContentReviewApi.ReviewRequestResponse(request.getId(), request.getContentVersion().getId(),
				request.getRequestNumber(), request.getStatus().name(), request.getRequestedBy().getId(),
				request.getCreatedAt(), request.getDecidedAt(), reviewerResponses);
	}

	private ContentReviewApi.DecisionResponse decisionResponse(ReviewDecision decision) {
		var reviewer = decision.getReviewer();
		return new ContentReviewApi.DecisionResponse(decision.getId(), reviewer.getId(),
				ContentReviewApi.displayName(reviewer), reviewer.getEmail(), decision.getDecision().name(),
				decision.getComment(), decision.getCreatedAt(), decision.getDecidedAt());
	}

	private ContentReviewApi.ReviewStatusResponse statusResponse(ContentVersion version, ReviewRequest request) {
		return new ContentReviewApi.ReviewStatusResponse(version.getId(), version.getStatus().name(), reviewResponse(request));
	}

	private ContentVersion requireVersion(UUID projectId, UUID versionId) {
		var version = versions.findById(versionId).orElseThrow(() -> new NotFoundException("Content version not found"));
		if (!version.getProject().getId().equals(projectId)) throw new NotFoundException("Content version not found");
		return version;
	}

	private ContentVersion requireVersionForUpdate(UUID projectId, UUID versionId) {
		var version = versions.findForUpdate(versionId)
				.orElseThrow(() -> new NotFoundException("Content version not found"));
		if (!version.getProject().getId().equals(projectId)) throw new NotFoundException("Content version not found");
		return version;
	}

	private ProjectMembership requireMember(AppUser actor, UUID projectId) {
		return memberships.findById(new ProjectMembershipId(projectId, actor.getId()))
				.orElseThrow(() -> new NotFoundException("Project not found"));
	}

	private void requireSubmitter(AppUser actor, UUID projectId) {
		var role = requireMember(actor, projectId).getRole();
		if (role != ProjectRole.OWNER && role != ProjectRole.EDITOR) {
			throw new ForbiddenException("Owner or editor access is required to submit content for review");
		}
	}

	private void requireReviewer(AppUser actor, UUID projectId) {
		if (requireMember(actor, projectId).getRole() != ProjectRole.REVIEWER) {
			throw new ForbiddenException("Reviewer access is required to decide a review");
		}
	}

	private static String normalized(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
