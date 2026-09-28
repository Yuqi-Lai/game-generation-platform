package com.gamegeneration.platform.project;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.gamegeneration.platform.membership.ProjectMembership;
import com.gamegeneration.platform.membership.ProjectMembershipId;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.shared.ConflictException;
import com.gamegeneration.platform.shared.ForbiddenException;
import com.gamegeneration.platform.user.AppUser;
import com.gamegeneration.platform.user.AppUserRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;

class ProjectServiceTest {
	private final ProjectRepository projects = mock(ProjectRepository.class);
	private final ProjectMembershipRepository memberships = mock(ProjectMembershipRepository.class);
	private final AppUserRepository users = mock(AppUserRepository.class);
	private final ProjectService service = new ProjectService(projects, memberships, users);

	@Test
	void createProjectAlsoCreatesOwnerMembership() {
		var actor = user("github|owner");
		when(projects.save(any(Project.class))).thenAnswer(invocation -> invocation.getArgument(0));
		when(memberships.save(any(ProjectMembership.class))).thenAnswer(invocation -> invocation.getArgument(0));

		var response = service.create(actor, new ProjectApi.CreateProjectRequest("Synthetic Project", "Description"));

		assertThat(response.currentUserRole()).isEqualTo(ProjectRole.OWNER);
		verify(projects).save(any(Project.class));
		verify(memberships).save(any(ProjectMembership.class));
	}

	@Test
	void editorCannotUpdateProjectMetadata() {
		var actor = user("github|editor");
		var project = new Project("Project", null, actor);
		var membership = new ProjectMembership(project, actor, ProjectRole.EDITOR, actor);
		when(memberships.findById(new ProjectMembershipId(project.getId(), actor.getId())))
				.thenReturn(Optional.of(membership));

		assertThatThrownBy(() -> service.update(actor, project.getId(),
				new ProjectApi.UpdateProjectRequest("Changed", null, 0L)))
				.isInstanceOf(ForbiddenException.class);
	}

	@Test
	void finalOwnerCannotBeRemoved() {
		var actor = user("github|owner");
		var project = new Project("Project", null, actor);
		var membership = new ProjectMembership(project, actor, ProjectRole.OWNER, actor);
		var id = new ProjectMembershipId(project.getId(), actor.getId());
		when(memberships.findById(id)).thenReturn(Optional.of(membership));
		when(memberships.findForUpdate(project.getId(), actor.getId())).thenReturn(Optional.of(membership));
		when(memberships.countByIdProjectIdAndRole(project.getId(), ProjectRole.OWNER)).thenReturn(1L);

		assertThatThrownBy(() -> service.removeMember(actor, project.getId(), actor.getId()))
				.isInstanceOf(ConflictException.class)
				.hasMessageContaining("at least one owner");
	}

	private static AppUser user(String subject) {
		return new AppUser("https://tenant.example/", subject, subject + "@example.test", true, subject);
	}
}
