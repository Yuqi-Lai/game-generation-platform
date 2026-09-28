package com.gamegeneration.platform.generation;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/generation-jobs/{jobId}")
public class GenerationJobCommandController {
	private final AuthenticatedUserService authenticatedUsers;
	private final GenerationService generations;

	public GenerationJobCommandController(AuthenticatedUserService authenticatedUsers,
			GenerationService generations) {
		this.authenticatedUsers = authenticatedUsers;
		this.generations = generations;
	}

	@PostMapping("/cancel")
	public GenerationApi.GenerationJobResponse cancel(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID jobId) {
		return generations.cancel(authenticatedUsers.resolve(jwt), projectId, jobId);
	}

	@PostMapping("/retry")
	public GenerationApi.GenerationJobResponse retry(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID jobId,
			@Valid @RequestBody GenerationApi.RetryGenerationRequest request) {
		return generations.retry(authenticatedUsers.resolve(jwt), projectId, jobId, request);
	}
}
