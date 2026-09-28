package com.gamegeneration.platform.generation;

import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.project.Project;
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
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "generation_job")
public class GenerationJob {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "project_id", nullable = false)
	private Project project;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "requested_by_user_id", nullable = false)
	private AppUser requestedBy;
	@Column(name = "request_prompt", nullable = false, columnDefinition = "text")
	private String requestPrompt;
	@Enumerated(EnumType.STRING) @Column(nullable = false)
	private GenerationJobStatus status;
	@OneToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "active_attempt_id")
	private GenerationAttempt activeAttempt;
	@OneToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "result_content_version_id")
	private ContentVersion resultContentVersion;
	@Column(name = "failure_code", length = 100) private String failureCode;
	@Column(name = "failure_message", columnDefinition = "text") private String failureMessage;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "updated_at", nullable = false) private Instant updatedAt;
	@Column(name = "completed_at") private Instant completedAt;
	@Version @Column(name = "row_version", nullable = false) private long version;

	protected GenerationJob() {}

	public GenerationJob(Project project, AppUser requestedBy, String requestPrompt) {
		this.id = UUID.randomUUID();
		this.project = project;
		this.requestedBy = requestedBy;
		this.requestPrompt = requestPrompt;
		this.status = GenerationJobStatus.QUEUED;
	}

	@PrePersist void prePersist() { createdAt = updatedAt = Instant.now(); }
	@PreUpdate void preUpdate() { updatedAt = Instant.now(); }
	public void activate(GenerationAttempt attempt) { activeAttempt = attempt; }
	public void succeed(ContentVersion contentVersion) {
		status = GenerationJobStatus.SUCCEEDED;
		resultContentVersion = contentVersion;
		completedAt = Instant.now();
		failureCode = null;
		failureMessage = null;
	}
	public void fail(String code, String message) {
		status = GenerationJobStatus.FAILED;
		failureCode = code;
		failureMessage = message;
		completedAt = Instant.now();
	}

	public UUID getId() { return id; }
	public Project getProject() { return project; }
	public AppUser getRequestedBy() { return requestedBy; }
	public String getRequestPrompt() { return requestPrompt; }
	public GenerationJobStatus getStatus() { return status; }
	public GenerationAttempt getActiveAttempt() { return activeAttempt; }
	public ContentVersion getResultContentVersion() { return resultContentVersion; }
	public String getFailureCode() { return failureCode; }
	public String getFailureMessage() { return failureMessage; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getUpdatedAt() { return updatedAt; }
	public Instant getCompletedAt() { return completedAt; }
	public long getVersion() { return version; }
}
