package com.gamegeneration.platform.pack;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/content-packs")
public class ContentPackController {
	private final AuthenticatedUserService authenticatedUsers;
	private final ContentPackService packs;
	public ContentPackController(AuthenticatedUserService authenticatedUsers, ContentPackService packs) {
		this.authenticatedUsers = authenticatedUsers;
		this.packs = packs;
	}
	@GetMapping
	public List<ContentPackApi.PackResponse> list(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		return packs.list(authenticatedUsers.resolve(jwt), projectId);
	}
	@PostMapping
	public ContentPackApi.PackResponse create(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@Valid @RequestBody ContentPackApi.CreatePackRequest request) {
		return packs.create(authenticatedUsers.resolve(jwt), projectId, request);
	}
	@GetMapping("/{packId}")
	public ContentPackApi.PackResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@PathVariable UUID packId) {
		return packs.get(authenticatedUsers.resolve(jwt), projectId, packId);
	}
	@PostMapping("/{packId}/items")
	public ContentPackApi.PackResponse addItem(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@PathVariable UUID packId, @Valid @RequestBody ContentPackApi.AddItemRequest request) {
		return packs.addItem(authenticatedUsers.resolve(jwt), projectId, packId, request);
	}
	@DeleteMapping("/{packId}/items/{versionId}")
	public ResponseEntity<ContentPackApi.PackResponse> removeItem(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID projectId, @PathVariable UUID packId, @PathVariable UUID versionId) {
		return ResponseEntity.ok(packs.removeItem(authenticatedUsers.resolve(jwt), projectId, packId, versionId));
	}
	@PostMapping("/{packId}/ready")
	public ContentPackApi.PackResponse ready(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@PathVariable UUID packId) {
		return packs.ready(authenticatedUsers.resolve(jwt), projectId, packId);
	}
	@PostMapping("/{packId}/exports")
	public ContentPackApi.PackResponse export(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId,
			@PathVariable UUID packId, @Valid @RequestBody ContentPackApi.StartExportRequest request) {
		return packs.startExport(authenticatedUsers.resolve(jwt), projectId, packId, request);
	}
}
