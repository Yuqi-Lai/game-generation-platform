package com.gamegeneration.platform.pack;

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
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "content_pack")
public class ContentPack {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "project_id", nullable = false) private Project project;
	@Column(nullable = false, length = 200) private String name;
	@Enumerated(EnumType.STRING) @Column(nullable = false) private ContentPackStatus status;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "created_by_user_id", nullable = false) private AppUser createdBy;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "updated_at", nullable = false) private Instant updatedAt;
	@Version @Column(name = "row_version", nullable = false) private long version;

	protected ContentPack() {}
	public ContentPack(Project project, String name, AppUser createdBy) {
		this.id = UUID.randomUUID();
		this.project = project;
		this.name = name;
		this.createdBy = createdBy;
		this.status = ContentPackStatus.DRAFT;
	}
	@PrePersist void prePersist() { createdAt = updatedAt = Instant.now(); }
	@PreUpdate void preUpdate() { updatedAt = Instant.now(); }
	public void ready() { transitionTo(ContentPackStatus.READY); }
	public void startExport() { transitionTo(ContentPackStatus.EXPORTING); }
	public void exported() { transitionTo(ContentPackStatus.EXPORTED); }
	public void fail() { transitionTo(ContentPackStatus.FAILED); }
	private void transitionTo(ContentPackStatus next) {
		ContentPackTransitions.require(status, next);
		status = next;
	}
	public UUID getId() { return id; }
	public Project getProject() { return project; }
	public String getName() { return name; }
	public ContentPackStatus getStatus() { return status; }
	public AppUser getCreatedBy() { return createdBy; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getUpdatedAt() { return updatedAt; }
	public long getVersion() { return version; }
}
