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
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "review_request")
public class ReviewRequest {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "content_version_id", nullable = false)
	private ContentVersion contentVersion;
	@Column(name = "request_number", nullable = false) private int requestNumber;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "requested_by_user_id", nullable = false)
	private AppUser requestedBy;
	@Column(name = "submit_idempotency_key", nullable = false) private UUID submitIdempotencyKey;
	@Enumerated(EnumType.STRING) @Column(nullable = false) private ReviewRequestStatus status;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "decided_at") private Instant decidedAt;
	@Version @Column(name = "row_version", nullable = false) private long version;

	protected ReviewRequest() {}

	public ReviewRequest(ContentVersion contentVersion, int requestNumber,
			AppUser requestedBy, UUID submitIdempotencyKey) {
		this.id = UUID.randomUUID();
		this.contentVersion = contentVersion;
		this.requestNumber = requestNumber;
		this.requestedBy = requestedBy;
		this.submitIdempotencyKey = submitIdempotencyKey;
		this.status = ReviewRequestStatus.OPEN;
	}

	@PrePersist void prePersist() { createdAt = Instant.now(); }
	public void approve() { resolve(ReviewRequestStatus.APPROVED); }
	public void requestChanges() { resolve(ReviewRequestStatus.CHANGES_REQUESTED); }
	public void supersede() { resolve(ReviewRequestStatus.SUPERSEDED); }
	private void resolve(ReviewRequestStatus next) {
		if (status == next) return;
		if (status != ReviewRequestStatus.OPEN) {
			throw new IllegalStateException("Cannot resolve review request in state " + status);
		}
		status = next;
		decidedAt = Instant.now();
	}

	public UUID getId() { return id; }
	public ContentVersion getContentVersion() { return contentVersion; }
	public int getRequestNumber() { return requestNumber; }
	public AppUser getRequestedBy() { return requestedBy; }
	public UUID getSubmitIdempotencyKey() { return submitIdempotencyKey; }
	public ReviewRequestStatus getStatus() { return status; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getDecidedAt() { return decidedAt; }
}
