package com.gamegeneration.platform.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.gamegeneration.platform.user.AppUser;
import com.gamegeneration.platform.user.AppUserRepository;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;

class AuthenticatedUserServiceTest {
	private final AppUserRepository users = mock(AppUserRepository.class);
	private final AccessInvitationRepository invitations = mock(AccessInvitationRepository.class);
	private final AuthenticatedUserService service = new AuthenticatedUserService(users, invitations);

	@Test
	void existingIdentityIsResolvedByIssuerAndSubjectNotEmail() {
		var existing = new AppUser("https://tenant.example/", "github|123", "old@example.test", true, "Old");
		when(users.findByAuthIssuerAndAuthSubject("https://tenant.example/", "github|123"))
				.thenReturn(Optional.of(existing));

		var resolved = service.resolve(jwt("github|123", "new@example.test", true));

		assertThat(resolved).isSameAs(existing);
		assertThat(resolved.getEmail()).isEqualTo("new@example.test");
	}

	@Test
	void invitedVerifiedIdentityIsCreatedAndInvitationConsumed() {
		var invitation = new AccessInvitation("invited@example.test", "test");
		when(users.findByAuthIssuerAndAuthSubject("https://tenant.example/", "github|456"))
				.thenReturn(Optional.empty());
		when(invitations.findPendingForUpdate("invited@example.test")).thenReturn(Optional.of(invitation));
		when(users.save(org.mockito.ArgumentMatchers.any(AppUser.class)))
				.thenAnswer(invocation -> invocation.getArgument(0));

		var created = service.resolve(jwt("github|456", "Invited@Example.Test", true));

		assertThat(created.getAuthSubject()).isEqualTo("github|456");
		assertThat(invitation.getStatus()).isEqualTo(InvitationStatus.ACCEPTED);
		verify(users).save(created);
	}

	@Test
	void uninvitedIdentityIsRejected() {
		when(users.findByAuthIssuerAndAuthSubject("https://tenant.example/", "github|789"))
				.thenReturn(Optional.empty());
		when(invitations.findPendingForUpdate("unknown@example.test")).thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.resolve(jwt("github|789", "unknown@example.test", true)))
				.isInstanceOf(AdmissionDeniedException.class)
				.hasMessageContaining("not been invited");
	}

	@Test
	void unverifiedIdentityIsRejectedBeforeInvitationLookup() {
		when(users.findByAuthIssuerAndAuthSubject("https://tenant.example/", "github|000"))
				.thenReturn(Optional.empty());

		assertThatThrownBy(() -> service.resolve(jwt("github|000", "invited@example.test", false)))
				.isInstanceOf(AdmissionDeniedException.class)
				.hasMessageContaining("verified");
	}

	private static Jwt jwt(String subject, String email, boolean verified) {
		return Jwt.withTokenValue("test-token")
				.header("alg", "none")
				.issuer("https://tenant.example/")
				.subject(subject)
				.claims(claims -> claims.putAll(Map.of(
						"email", email,
						"email_verified", verified,
						"name", "Synthetic User")))
				.build();
	}
}
