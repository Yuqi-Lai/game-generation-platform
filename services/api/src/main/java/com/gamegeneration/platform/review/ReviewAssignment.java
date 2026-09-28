package com.gamegeneration.platform.review;

import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_assignment")
public class ReviewAssignment {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "review_request_id", nullable = false)
	private ReviewRequest reviewRequest;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "content_version_id", nullable = false)
	private ContentVersion contentVersion;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "reviewer_user_id", nullable = false)
	private AppUser reviewer;
	@Column(name = "created_at", nullable = false) private Instant createdAt;

	protected ReviewAssignment() {}

	public ReviewAssignment(ReviewRequest reviewRequest, ContentVersion contentVersion, AppUser reviewer) {
		this.id = UUID.randomUUID();
		this.reviewRequest = reviewRequest;
		this.contentVersion = contentVersion;
		this.reviewer = reviewer;
	}

	@PrePersist void prePersist() { createdAt = Instant.now(); }
	public UUID getId() { return id; }
	public ReviewRequest getReviewRequest() { return reviewRequest; }
	public ContentVersion getContentVersion() { return contentVersion; }
	public AppUser getReviewer() { return reviewer; }
	public Instant getCreatedAt() { return createdAt; }
}
