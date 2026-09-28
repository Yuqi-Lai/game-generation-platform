package com.gamegeneration.platform.pack;

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
@Table(name = "export_job")
public class ExportJob {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "content_pack_id", nullable = false) private ContentPack contentPack;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "requested_by_user_id", nullable = false) private AppUser requestedBy;
	@Column(name = "request_idempotency_key", nullable = false) private UUID requestIdempotencyKey;
	@Column(name = "execution_key", nullable = false) private UUID executionKey;
	@Enumerated(EnumType.STRING) @Column(nullable = false) private ExportJobStatus status;
	@Column(name = "artifact_bucket") private String artifactBucket;
	@Column(name = "artifact_key", nullable = false, length = 1024) private String artifactKey;
	@Column(name = "artifact_content_type") private String artifactContentType;
	@Column(name = "artifact_size_bytes") private Long artifactSizeBytes;
	@Column(name = "artifact_sha256", length = 64) private String artifactSha256;
	@Column(name = "failure_code", length = 100) private String failureCode;
	@Column(name = "failure_message", columnDefinition = "text") private String failureMessage;
	@Column(name = "worker_execution_id", length = 160) private String workerExecutionId;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "started_at") private Instant startedAt;
	@Column(name = "completed_at") private Instant completedAt;
	@Version @Column(name = "row_version", nullable = false) private long version;

	protected ExportJob() {}
	public ExportJob(ContentPack pack, AppUser requestedBy, UUID requestId, String artifactKeyPrefix) {
		this.id = UUID.randomUUID();
		this.contentPack = pack;
		this.requestedBy = requestedBy;
		this.requestIdempotencyKey = requestId;
		this.executionKey = UUID.randomUUID();
		this.artifactKey = artifactKeyPrefix + "/" + id + ".zip";
		this.status = ExportJobStatus.QUEUED;
	}
	@PrePersist void prePersist() { createdAt = Instant.now(); }
	public void start(String workerExecutionId) {
		if (status == ExportJobStatus.RUNNING) return;
		if (status != ExportJobStatus.QUEUED) throw new IllegalStateException("Cannot start export job in state " + status);
		status = ExportJobStatus.RUNNING;
		this.workerExecutionId = workerExecutionId;
		startedAt = Instant.now();
	}
	public void succeed(String workerExecutionId, String bucket, String key,
			String contentType, long sizeBytes, String sha256) {
		if (status.isTerminal()) return;
		status = ExportJobStatus.SUCCEEDED;
		this.workerExecutionId = workerExecutionId;
		artifactBucket = bucket;
		artifactKey = key;
		artifactContentType = contentType;
		artifactSizeBytes = sizeBytes;
		artifactSha256 = sha256;
		startedAt = startedAt == null ? createdAt : startedAt;
		completedAt = Instant.now();
	}
	public void fail(String workerExecutionId, String code, String message) {
		if (status.isTerminal()) return;
		status = ExportJobStatus.FAILED;
		this.workerExecutionId = workerExecutionId;
		failureCode = code;
		failureMessage = message;
		startedAt = startedAt == null ? createdAt : startedAt;
		completedAt = Instant.now();
	}
	public UUID getId() { return id; }
	public ContentPack getContentPack() { return contentPack; }
	public UUID getRequestIdempotencyKey() { return requestIdempotencyKey; }
	public UUID getExecutionKey() { return executionKey; }
	public ExportJobStatus getStatus() { return status; }
	public String getArtifactBucket() { return artifactBucket; }
	public String getArtifactKey() { return artifactKey; }
	public String getArtifactContentType() { return artifactContentType; }
	public Long getArtifactSizeBytes() { return artifactSizeBytes; }
	public String getArtifactSha256() { return artifactSha256; }
	public String getFailureCode() { return failureCode; }
	public String getFailureMessage() { return failureMessage; }
	public String getWorkerExecutionId() { return workerExecutionId; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getStartedAt() { return startedAt; }
	public Instant getCompletedAt() { return completedAt; }
}
