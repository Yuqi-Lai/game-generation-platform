package com.gamegeneration.platform.generation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "generation_attempt")
public class GenerationAttempt {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "job_id", nullable = false)
	private GenerationJob job;
	@Column(name = "attempt_number", nullable = false) private int attemptNumber;
	@Column(name = "execution_key", nullable = false) private UUID executionKey;
	@Enumerated(EnumType.STRING) @Column(nullable = false) private GenerationAttemptStatus status;
	@Column(nullable = false, length = 50) private String provider;
	@Column(length = 100) private String model;
	@Column(name = "started_at") private Instant startedAt;
	@Column(name = "completed_at") private Instant completedAt;
	@Column(name = "failure_code", length = 100) private String failureCode;
	@Column(name = "failure_message", columnDefinition = "text") private String failureMessage;
	@Column(name = "failure_retryable") private Boolean failureRetryable;
	@Column(name = "worker_execution_id", length = 160) private String workerExecutionId;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "updated_at", nullable = false) private Instant updatedAt;
	@Version @Column(name = "row_version", nullable = false) private long version;

	protected GenerationAttempt() {}
	public GenerationAttempt(GenerationJob job, int attemptNumber, String provider) {
		this.id = UUID.randomUUID();
		this.job = job;
		this.attemptNumber = attemptNumber;
		this.executionKey = UUID.randomUUID();
		this.status = GenerationAttemptStatus.QUEUED;
		this.provider = provider;
	}
	@PrePersist void prePersist() { createdAt = updatedAt = Instant.now(); }
	@PreUpdate void preUpdate() { updatedAt = Instant.now(); }
	public void start(String workerExecutionId) {
		if (status == GenerationAttemptStatus.RUNNING) return;
		if (status != GenerationAttemptStatus.QUEUED) throw new IllegalStateException("Cannot start attempt in state " + status);
		status = GenerationAttemptStatus.RUNNING;
		this.workerExecutionId = workerExecutionId;
		startedAt = Instant.now();
	}
	public void succeed(String model, String workerExecutionId) {
		if (status.isTerminal()) return;
		status = GenerationAttemptStatus.SUCCEEDED;
		this.model = model;
		this.workerExecutionId = workerExecutionId;
		startedAt = startedAt == null ? createdAt : startedAt;
		completedAt = Instant.now();
	}
	public void fail(String model, String workerExecutionId, String code, String message, boolean retryable) {
		if (status.isTerminal()) return;
		status = GenerationAttemptStatus.FAILED;
		this.model = model;
		this.workerExecutionId = workerExecutionId;
		failureCode = code;
		failureMessage = message;
		failureRetryable = retryable;
		startedAt = startedAt == null ? createdAt : startedAt;
		completedAt = Instant.now();
	}
	public void cancel() { if (!status.isTerminal()) { status = GenerationAttemptStatus.CANCELLED; completedAt = Instant.now(); } }
	public void timeOut() { if (!status.isTerminal()) { status = GenerationAttemptStatus.TIMED_OUT; completedAt = Instant.now(); } }
	public UUID getId() { return id; }
	public GenerationJob getJob() { return job; }
	public int getAttemptNumber() { return attemptNumber; }
	public UUID getExecutionKey() { return executionKey; }
	public GenerationAttemptStatus getStatus() { return status; }
	public String getProvider() { return provider; }
	public String getModel() { return model; }
	public Instant getStartedAt() { return startedAt; }
	public Instant getCompletedAt() { return completedAt; }
	public String getFailureCode() { return failureCode; }
	public String getFailureMessage() { return failureMessage; }
	public Boolean getFailureRetryable() { return failureRetryable; }
	public String getWorkerExecutionId() { return workerExecutionId; }
}
