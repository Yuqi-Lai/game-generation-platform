package com.gamegeneration.platform.credit;

import com.gamegeneration.platform.project.Project;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "project_credit_account")
public class ProjectCreditAccount {
	@Id @Column(name = "project_id") private UUID projectId;
	@Column(name = "total_granted", nullable = false) private long totalGranted;
	@Column(nullable = false) private long reserved;
	@Column(nullable = false) private long consumed;
	@Column(name = "updated_at", nullable = false) private Instant updatedAt;
	@Version @Column(name = "row_version", nullable = false) private long version;

	protected ProjectCreditAccount() {}

	public ProjectCreditAccount(Project project, long initialGrant) {
		this.projectId = project.getId();
		this.totalGranted = initialGrant;
	}

	@PrePersist @PreUpdate void touch() { updatedAt = Instant.now(); }

	public void reserve(long amount) {
		if (amount <= 0) throw new IllegalArgumentException("Credit reservation must be positive");
		if (available() < amount) throw new InsufficientCreditsException(amount, available());
		reserved += amount;
	}

	public void capture(long amount) {
		if (amount <= 0 || reserved < amount) throw new IllegalStateException("Invalid credit capture");
		reserved -= amount;
		consumed += amount;
	}

	public void release(long amount) {
		if (amount <= 0 || reserved < amount) throw new IllegalStateException("Invalid credit release");
		reserved -= amount;
	}

	public long available() { return totalGranted - reserved - consumed; }
	public UUID getProjectId() { return projectId; }
	public long getTotalGranted() { return totalGranted; }
	public long getReserved() { return reserved; }
	public long getConsumed() { return consumed; }
	public Instant getUpdatedAt() { return updatedAt; }
}
