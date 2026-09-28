package com.gamegeneration.platform.review;

import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_decision")
public class ReviewDecision {
	@Id private UUID id;
	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "review_assignment_id", nullable = false)
	private ReviewAssignment assignment;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "review_request_id", nullable = false)
	private ReviewRequest reviewRequest;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "content_version_id", nullable = false)
	private ContentVersion contentVersion;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "reviewer_user_id", nullable = false)
	private AppUser reviewer;
	@Enumerated(EnumType.STRING) @Column(nullable = false) private ReviewDecisionType decision;
	@Column(columnDefinition = "text") private String comment;
	@Column(name = "request_idempotency_key", nullable = false) private UUID requestIdempotencyKey;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "decided_at", nullable = false) private Instant decidedAt;

	protected ReviewDecision() {}

	public ReviewDecision(ReviewAssignment assignment, ReviewDecisionType decision,
			String comment, UUID requestIdempotencyKey) {
		this.id = UUID.randomUUID();
		this.assignment = assignment;
		this.reviewRequest = assignment.getReviewRequest();
		this.contentVersion = assignment.getContentVersion();
		this.reviewer = assignment.getReviewer();
		this.decision = decision;
		this.comment = comment;
		this.requestIdempotencyKey = requestIdempotencyKey;
	}

	@PrePersist void prePersist() { createdAt = decidedAt = Instant.now(); }
	public UUID getId() { return id; }
	public ReviewAssignment getAssignment() { return assignment; }
	public ReviewRequest getReviewRequest() { return reviewRequest; }
	public ContentVersion getContentVersion() { return contentVersion; }
	public AppUser getReviewer() { return reviewer; }
	public ReviewDecisionType getDecision() { return decision; }
	public String getComment() { return comment; }
	public UUID getRequestIdempotencyKey() { return requestIdempotencyKey; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getDecidedAt() { return decidedAt; }
}
