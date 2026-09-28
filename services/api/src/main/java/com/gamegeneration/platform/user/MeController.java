package com.gamegeneration.platform.user;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/me")
public class MeController {
	private final AuthenticatedUserService authenticatedUsers;

	public MeController(AuthenticatedUserService authenticatedUsers) {
		this.authenticatedUsers = authenticatedUsers;
	}

	@GetMapping
	public UserApi.UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		return UserApi.UserResponse.from(authenticatedUsers.resolve(jwt));
	}
}
