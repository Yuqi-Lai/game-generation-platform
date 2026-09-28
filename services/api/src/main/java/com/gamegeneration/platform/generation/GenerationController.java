package com.gamegeneration.platform.generation;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/generations")
public class GenerationController {
	private final AuthenticatedUserService authenticatedUsers;
	private final GenerationService generations;

	public GenerationController(AuthenticatedUserService authenticatedUsers, GenerationService generations) {
		this.authenticatedUsers = authenticatedUsers;
		this.generations = generations;
	}

	@PostMapping
	public ResponseEntity<GenerationApi.GenerationJobResponse> create(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @Valid @RequestBody GenerationApi.CreateGenerationRequest request) {
		var created = generations.create(authenticatedUsers.resolve(jwt), projectId, request);
		return ResponseEntity.created(URI.create("/api/v1/projects/%s/generations/%s"
				.formatted(projectId, created.id()))).body(created);
	}

	@GetMapping("/{jobId}")
	public GenerationApi.GenerationJobResponse get(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID jobId) {
		return generations.get(authenticatedUsers.resolve(jwt), projectId, jobId);
	}
}
