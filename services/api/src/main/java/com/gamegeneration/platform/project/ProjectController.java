package com.gamegeneration.platform.project;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects")
public class ProjectController {
	private final AuthenticatedUserService authenticatedUsers;
	private final ProjectService projects;

	public ProjectController(AuthenticatedUserService authenticatedUsers, ProjectService projects) {
		this.authenticatedUsers = authenticatedUsers;
		this.projects = projects;
	}

	@PostMapping
	public ResponseEntity<ProjectApi.ProjectResponse> create(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody ProjectApi.CreateProjectRequest request) {
		var created = projects.create(authenticatedUsers.resolve(jwt), request);
		return ResponseEntity.created(URI.create("/api/v1/projects/" + created.id())).body(created);
	}

	@GetMapping
	public List<ProjectApi.ProjectResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return projects.list(authenticatedUsers.resolve(jwt));
	}

	@GetMapping("/{projectId}")
	public ProjectApi.ProjectResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		return projects.get(authenticatedUsers.resolve(jwt), projectId);
	}

	@PatchMapping("/{projectId}")
	public ProjectApi.ProjectResponse update(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@Valid @RequestBody ProjectApi.UpdateProjectRequest request) {
		return projects.update(authenticatedUsers.resolve(jwt), projectId, request);
	}

	@PostMapping("/{projectId}/archive")
	public ProjectApi.ProjectResponse archive(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		return projects.archive(authenticatedUsers.resolve(jwt), projectId);
	}

	@PostMapping("/{projectId}/restore")
	public ProjectApi.ProjectResponse restore(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		return projects.restore(authenticatedUsers.resolve(jwt), projectId);
	}

	@GetMapping("/{projectId}/members")
	public List<ProjectApi.MemberResponse> members(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		return projects.members(authenticatedUsers.resolve(jwt), projectId);
	}

	@PutMapping("/{projectId}/members/{userId}")
	public ProjectApi.MemberResponse putMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@PathVariable UUID userId, @Valid @RequestBody ProjectApi.ChangeMembershipRequest request) {
		return projects.putMember(authenticatedUsers.resolve(jwt), projectId, userId, request.role());
	}

	@DeleteMapping("/{projectId}/members/{userId}")
	public ResponseEntity<Void> removeMember(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@PathVariable UUID userId) {
		projects.removeMember(authenticatedUsers.resolve(jwt), projectId, userId);
		return ResponseEntity.noContent().build();
	}

	@PostMapping("/{projectId}/leave")
	public ResponseEntity<Void> leave(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		projects.leave(authenticatedUsers.resolve(jwt), projectId);
		return ResponseEntity.noContent().build();
	}
}
