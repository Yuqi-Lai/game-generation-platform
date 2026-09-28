package com.gamegeneration.platform.credit;

import com.gamegeneration.platform.generation.GenerationJob;
import com.gamegeneration.platform.project.Project;
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
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "credit_ledger")
public class CreditLedgerEntry {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "project_id", nullable = false) private Project project;
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "generation_job_id") private GenerationJob generationJob;
	@Column(nullable = false) private long amount;
	@Enumerated(EnumType.STRING) @Column(name = "movement_type", nullable = false)
	private CreditMovementType movementType;
	@Column(name = "idempotency_key", nullable = false, length = 255) private String idempotencyKey;
	@Column(name = "created_at", nullable = false) private Instant createdAt;

	protected CreditLedgerEntry() {}

	public CreditLedgerEntry(Project project, GenerationJob generationJob, long amount,
			CreditMovementType movementType, String idempotencyKey) {
		this.id = UUID.randomUUID();
		this.project = project;
		this.generationJob = generationJob;
		this.amount = amount;
		this.movementType = movementType;
		this.idempotencyKey = idempotencyKey;
	}

	@PrePersist void prePersist() { createdAt = Instant.now(); }
	public UUID getId() { return id; }
	public Project getProject() { return project; }
	public GenerationJob getGenerationJob() { return generationJob; }
	public long getAmount() { return amount; }
	public CreditMovementType getMovementType() { return movementType; }
	public String getIdempotencyKey() { return idempotencyKey; }
	public Instant getCreatedAt() { return createdAt; }
}
