package com.gamegeneration.platform.project;

import com.gamegeneration.platform.membership.ProjectMembership;
import com.gamegeneration.platform.membership.ProjectMembershipId;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.shared.ConflictException;
import com.gamegeneration.platform.shared.ForbiddenException;
import com.gamegeneration.platform.shared.NotFoundException;
import com.gamegeneration.platform.user.AppUser;
import com.gamegeneration.platform.user.AppUserRepository;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ProjectService {
	private final ProjectRepository projects;
	private final ProjectMembershipRepository memberships;
	private final AppUserRepository users;

	public ProjectService(ProjectRepository projects, ProjectMembershipRepository memberships,
			AppUserRepository users) {
		this.projects = projects;
		this.memberships = memberships;
		this.users = users;
	}

	@Transactional
	public ProjectApi.ProjectResponse create(AppUser actor, ProjectApi.CreateProjectRequest request) {
		var project = projects.save(new Project(request.name().trim(), normalized(request.description()), actor));
		var membership = memberships.save(new ProjectMembership(project, actor, ProjectRole.OWNER, actor));
		return ProjectApi.ProjectResponse.from(project, membership.getRole());
	}

	@Transactional(readOnly = true)
	public List<ProjectApi.ProjectResponse> list(AppUser actor) {
		return projects.findVisibleTo(actor.getId()).stream()
				.map(project -> ProjectApi.ProjectResponse.from(project,
						requireMembership(project.getId(), actor.getId()).getRole()))
				.toList();
	}

	@Transactional(readOnly = true)
	public ProjectApi.ProjectResponse get(AppUser actor, UUID projectId) {
		var membership = requireMembership(projectId, actor.getId());
		return ProjectApi.ProjectResponse.from(requireProject(projectId), membership.getRole());
	}

	@Transactional
	public ProjectApi.ProjectResponse update(AppUser actor, UUID projectId, ProjectApi.UpdateProjectRequest request) {
		var owner = requireOwner(projectId, actor.getId());
		var project = requireProject(projectId);
		if (project.getVersion() != request.version()) {
			throw new ConflictException("Project has changed; reload before updating");
		}
		project.update(request.name().trim(), normalized(request.description()));
		return ProjectApi.ProjectResponse.from(project, owner.getRole());
	}

	@Transactional
	public ProjectApi.ProjectResponse archive(AppUser actor, UUID projectId) {
		var owner = requireOwner(projectId, actor.getId());
		var project = requireProject(projectId);
		project.archive();
		return ProjectApi.ProjectResponse.from(project, owner.getRole());
	}

	@Transactional
	public ProjectApi.ProjectResponse restore(AppUser actor, UUID projectId) {
		var owner = requireOwner(projectId, actor.getId());
		var project = requireProject(projectId);
		project.restore();
		return ProjectApi.ProjectResponse.from(project, owner.getRole());
	}

	@Transactional(readOnly = true)
	public List<ProjectApi.MemberResponse> members(AppUser actor, UUID projectId) {
		requireMembership(projectId, actor.getId());
		return memberships.findAllByIdProjectIdOrderByCreatedAtAsc(projectId).stream()
				.map(ProjectApi.MemberResponse::from)
				.toList();
	}

	@Transactional
	public ProjectApi.MemberResponse putMember(AppUser actor, UUID projectId, UUID userId, ProjectRole role) {
		requireOwner(projectId, actor.getId());
		var project = requireProject(projectId);
		var target = users.findById(userId).orElseThrow(() -> new NotFoundException("User not found"));
		var id = new ProjectMembershipId(projectId, userId);
		var existing = memberships.findForUpdate(projectId, userId);
		if (existing.isPresent()) {
			var membership = existing.get();
			guardFinalOwner(membership, role);
			membership.changeRole(role);
			return ProjectApi.MemberResponse.from(membership);
		}
		return ProjectApi.MemberResponse.from(
				memberships.save(new ProjectMembership(project, target, role, actor)));
	}

	@Transactional
	public void removeMember(AppUser actor, UUID projectId, UUID userId) {
		requireOwner(projectId, actor.getId());
		var membership = memberships.findForUpdate(projectId, userId)
				.orElseThrow(() -> new NotFoundException("Project membership not found"));
		guardFinalOwner(membership, null);
		memberships.delete(membership);
	}

	@Transactional
	public void leave(AppUser actor, UUID projectId) {
		var membership = memberships.findForUpdate(projectId, actor.getId())
				.orElseThrow(() -> new NotFoundException("Project not found"));
		guardFinalOwner(membership, null);
		memberships.delete(membership);
	}

	private void guardFinalOwner(ProjectMembership membership, ProjectRole replacement) {
		if (membership.getRole() == ProjectRole.OWNER && replacement != ProjectRole.OWNER
				&& memberships.countByIdProjectIdAndRole(
						membership.getProject().getId(), ProjectRole.OWNER) <= 1) {
			throw new ConflictException("A project must retain at least one owner");
		}
	}

	private Project requireProject(UUID projectId) {
		return projects.findById(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
	}

	private ProjectMembership requireMembership(UUID projectId, UUID userId) {
		return memberships.findById(new ProjectMembershipId(projectId, userId))
				.orElseThrow(() -> new NotFoundException("Project not found"));
	}

	private ProjectMembership requireOwner(UUID projectId, UUID userId) {
		var membership = requireMembership(projectId, userId);
		if (membership.getRole() != ProjectRole.OWNER) {
			throw new ForbiddenException("Owner access is required");
		}
		return membership;
	}

	private static String normalized(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}
}
