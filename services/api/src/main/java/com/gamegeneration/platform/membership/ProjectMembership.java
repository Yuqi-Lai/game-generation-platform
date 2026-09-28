package com.gamegeneration.platform.membership;

import com.gamegeneration.platform.project.Project;
import com.gamegeneration.platform.project.ProjectRole;
import com.gamegeneration.platform.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.MapsId;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;

@Entity
@Table(name = "project_membership")
public class ProjectMembership {
	@EmbeddedId
	private ProjectMembershipId id;

	@MapsId("projectId")
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "project_id", nullable = false)
	private Project project;

	@MapsId("userId")
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "user_id", nullable = false)
	private AppUser user;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private ProjectRole role;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "created_by_user_id", nullable = false)
	private AppUser createdBy;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Version
	@Column(name = "row_version", nullable = false)
	private long version;

	protected ProjectMembership() {}

	public ProjectMembership(Project project, AppUser user, ProjectRole role, AppUser createdBy) {
		this.id = new ProjectMembershipId(project.getId(), user.getId());
		this.project = project;
		this.user = user;
		this.role = role;
		this.createdBy = createdBy;
	}

	@PrePersist
	void prePersist() {
		var now = Instant.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() { updatedAt = Instant.now(); }

	public void changeRole(ProjectRole role) { this.role = role; }

	public ProjectMembershipId getId() { return id; }
	public Project getProject() { return project; }
	public AppUser getUser() { return user; }
	public ProjectRole getRole() { return role; }
	public Instant getCreatedAt() { return createdAt; }
	public long getVersion() { return version; }
}
