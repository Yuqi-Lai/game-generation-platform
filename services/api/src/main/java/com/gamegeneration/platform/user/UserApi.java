package com.gamegeneration.platform.user;

import java.util.UUID;

public final class UserApi {
	private UserApi() {}

	public record UserResponse(
			UUID id,
			String email,
			boolean emailVerified,
			String displayName,
			UserStatus status) {
		public static UserResponse from(AppUser user) {
			return new UserResponse(user.getId(), user.getEmail(), user.isEmailVerified(),
					user.getDisplayName(), user.getStatus());
		}
	}
}
