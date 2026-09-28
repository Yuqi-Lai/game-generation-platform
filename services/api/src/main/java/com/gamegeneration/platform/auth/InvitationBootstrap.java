package com.gamegeneration.platform.auth;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class InvitationBootstrap implements ApplicationRunner {
	private final AuthProperties properties;
	private final AccessInvitationRepository invitations;

	public InvitationBootstrap(AuthProperties properties, AccessInvitationRepository invitations) {
		this.properties = properties;
		this.invitations = invitations;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		var emails = properties.auth().bootstrapInvitedEmails();
		if (emails == null) {
			return;
		}
		for (String email : emails) {
			String normalized = AccessInvitation.normalize(email);
			if (normalized != null && !normalized.isBlank()
					&& !invitations.existsByEmailNormalizedAndStatus(normalized, InvitationStatus.PENDING)) {
				invitations.save(new AccessInvitation(normalized, "Bootstrapped from configuration"));
			}
		}
	}
}
