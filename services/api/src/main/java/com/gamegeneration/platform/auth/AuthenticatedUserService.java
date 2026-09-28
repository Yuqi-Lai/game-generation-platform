package com.gamegeneration.platform.auth;

import com.gamegeneration.platform.user.AppUser;
import com.gamegeneration.platform.user.AppUserRepository;
import com.gamegeneration.platform.user.UserStatus;
import java.util.Optional;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthenticatedUserService {
	private final AppUserRepository users;
	private final AccessInvitationRepository invitations;

	public AuthenticatedUserService(AppUserRepository users, AccessInvitationRepository invitations) {
		this.users = users;
		this.invitations = invitations;
	}

	@Transactional
	public AppUser resolve(Jwt jwt) {
		String issuer = Optional.ofNullable(jwt.getIssuer())
				.map(Object::toString)
				.orElseThrow(() -> new AdmissionDeniedException("Token is missing an issuer"));
		String subject = jwt.getSubject();
		if (subject == null || subject.isBlank()) {
			throw new AdmissionDeniedException("Token is missing a subject");
		}

		var existing = users.findByAuthIssuerAndAuthSubject(issuer, subject);
		if (existing.isPresent()) {
			var user = existing.get();
			if (user.getStatus() != UserStatus.ACTIVE) {
				throw new AdmissionDeniedException("User access is disabled");
			}
			user.synchronizeProfile(jwt.getClaimAsString("email"),
					Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified")),
					jwt.getClaimAsString("name"));
			return user;
		}

		String email = jwt.getClaimAsString("email");
		boolean verified = Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified"));
		if (!verified || email == null || email.isBlank()) {
			throw new AdmissionDeniedException("A verified invited email is required for first access");
		}

		var invitation = invitations.findPendingForUpdate(AccessInvitation.normalize(email))
				.orElseThrow(() -> new AdmissionDeniedException("This account has not been invited"));
		var user = users.save(new AppUser(issuer, subject, email, true, jwt.getClaimAsString("name")));
		invitation.accept(user);
		return user;
	}
}
