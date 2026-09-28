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
	@Column(name = "finished_at") private Instant finishedAt;
	@Column(name = "failure_code", length = 100) private String failureCode;
	@Column(name = "failure_message", columnDefinition = "text") private String failureMessage;
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
	public void succeed(String model) {
		status = GenerationAttemptStatus.SUCCEEDED;
		this.model = model;
		startedAt = startedAt == null ? createdAt : startedAt;
		finishedAt = Instant.now();
	}
	public void fail(String model, String code, String message) {
		status = GenerationAttemptStatus.FAILED;
		this.model = model;
		failureCode = code;
		failureMessage = message;
		startedAt = startedAt == null ? createdAt : startedAt;
		finishedAt = Instant.now();
	}
	public UUID getId() { return id; }
	public GenerationJob getJob() { return job; }
	public int getAttemptNumber() { return attemptNumber; }
	public UUID getExecutionKey() { return executionKey; }
	public GenerationAttemptStatus getStatus() { return status; }
	public String getProvider() { return provider; }
	public String getModel() { return model; }
	public Instant getStartedAt() { return startedAt; }
	public Instant getFinishedAt() { return finishedAt; }
}
