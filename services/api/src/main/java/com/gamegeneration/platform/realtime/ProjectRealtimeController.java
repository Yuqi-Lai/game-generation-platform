package com.gamegeneration.platform.realtime;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import com.gamegeneration.platform.project.ProjectService;
import java.util.UUID;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/events")
public class ProjectRealtimeController {
	private final AuthenticatedUserService authenticatedUsers;
	private final ProjectService projects;
	private final ProjectSseRegistry registry;

	public ProjectRealtimeController(AuthenticatedUserService authenticatedUsers,
			ProjectService projects, ProjectSseRegistry registry) {
		this.authenticatedUsers = authenticatedUsers;
		this.projects = projects;
		this.registry = registry;
	}

	@GetMapping(produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public SseEmitter events(@PathVariable UUID projectId, @AuthenticationPrincipal Jwt jwt) {
		var actor = authenticatedUsers.resolve(jwt);
		projects.get(actor, projectId);
		return registry.connect(projectId);
	}
}
