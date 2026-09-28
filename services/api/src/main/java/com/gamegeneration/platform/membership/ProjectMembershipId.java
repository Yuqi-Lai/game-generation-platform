package com.gamegeneration.platform.membership;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class ProjectMembershipId implements Serializable {
	@Column(name = "project_id")
	private UUID projectId;

	@Column(name = "user_id")
	private UUID userId;

	protected ProjectMembershipId() {}

	public ProjectMembershipId(UUID projectId, UUID userId) {
		this.projectId = projectId;
		this.userId = userId;
	}

	public UUID getProjectId() { return projectId; }
	public UUID getUserId() { return userId; }

	@Override
	public boolean equals(Object other) {
		if (this == other) return true;
		if (!(other instanceof ProjectMembershipId that)) return false;
		return Objects.equals(projectId, that.projectId) && Objects.equals(userId, that.userId);
	}

	@Override
	public int hashCode() { return Objects.hash(projectId, userId); }
}
