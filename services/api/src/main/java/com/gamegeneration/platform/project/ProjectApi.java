package com.gamegeneration.platform.project;

import com.gamegeneration.platform.membership.ProjectMembership;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.UUID;

public final class ProjectApi {
	private ProjectApi() {}

	public record CreateProjectRequest(
			@NotBlank @Size(max = 160) String name,
			@Size(max = 10000) String description) {}

	public record UpdateProjectRequest(
			@NotBlank @Size(max = 160) String name,
			@Size(max = 10000) String description,
			@NotNull Long version) {}

	public record ChangeMembershipRequest(@NotNull ProjectRole role) {}

	public record ProjectResponse(
			UUID id,
			String name,
			String description,
			ProjectStatus status,
			ProjectRole currentUserRole,
			Instant createdAt,
			Instant updatedAt,
			Instant archivedAt,
			long version) {
		static ProjectResponse from(Project project, ProjectRole role) {
			return new ProjectResponse(project.getId(), project.getName(), project.getDescription(),
					project.getStatus(), role, project.getCreatedAt(), project.getUpdatedAt(),
					project.getArchivedAt(), project.getVersion());
		}
	}

	public record MemberResponse(
			UUID userId,
			String email,
			String displayName,
			ProjectRole role,
			Instant joinedAt) {
		static MemberResponse from(ProjectMembership membership) {
			var user = membership.getUser();
			return new MemberResponse(user.getId(), user.getEmail(), user.getDisplayName(),
					membership.getRole(), membership.getCreatedAt());
		}
	}
}
