package com.gamegeneration.platform.project;

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
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "project")
public class Project {
	@Id
	private UUID id;

	@Column(nullable = false, length = 160)
	private String name;

	@Column(columnDefinition = "text")
	private String description;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private ProjectStatus status;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "created_by_user_id", nullable = false)
	private AppUser createdBy;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "archived_at")
	private Instant archivedAt;

	@Version
	@Column(name = "row_version", nullable = false)
	private long version;

	protected Project() {}

	public Project(String name, String description, AppUser createdBy) {
		this.id = UUID.randomUUID();
		this.name = name;
		this.description = description;
		this.createdBy = createdBy;
		this.status = ProjectStatus.ACTIVE;
	}

	@PrePersist
	void prePersist() {
		var now = Instant.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() { updatedAt = Instant.now(); }

	public void update(String name, String description) {
		this.name = name;
		this.description = description;
	}

	public void archive() {
		status = ProjectStatus.ARCHIVED;
		archivedAt = Instant.now();
	}

	public void restore() {
		status = ProjectStatus.ACTIVE;
		archivedAt = null;
	}

	public UUID getId() { return id; }
	public String getName() { return name; }
	public String getDescription() { return description; }
	public ProjectStatus getStatus() { return status; }
	public AppUser getCreatedBy() { return createdBy; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getUpdatedAt() { return updatedAt; }
	public Instant getArchivedAt() { return archivedAt; }
	public long getVersion() { return version; }
}
