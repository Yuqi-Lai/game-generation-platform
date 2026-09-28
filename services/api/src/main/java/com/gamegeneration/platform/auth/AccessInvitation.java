package com.gamegeneration.platform.auth;

import com.gamegeneration.platform.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

@Entity
@Table(name = "access_invitation")
public class AccessInvitation {
	@Id
	private UUID id;

	@Column(name = "email_normalized", nullable = false, length = 320)
	private String emailNormalized;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private InvitationStatus status;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "accepted_by_user_id")
	private AppUser acceptedBy;

	@Column(length = 500)
	private String note;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "accepted_at")
	private Instant acceptedAt;

	@Column(name = "revoked_at")
	private Instant revokedAt;

	@Version
	@Column(name = "row_version", nullable = false)
	private long version;

	protected AccessInvitation() {}

	public AccessInvitation(String email, String note) {
		this.id = UUID.randomUUID();
		this.emailNormalized = normalize(email);
		this.status = InvitationStatus.PENDING;
		this.note = note;
	}

	@PrePersist
	void prePersist() {
		createdAt = Instant.now();
	}

	public void accept(AppUser user) {
		if (status != InvitationStatus.PENDING) {
			throw new IllegalStateException("Only pending invitations can be accepted");
		}
		status = InvitationStatus.ACCEPTED;
		acceptedBy = user;
		acceptedAt = Instant.now();
	}

	public static String normalize(String email) {
		return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
	}

	public UUID getId() { return id; }
	public String getEmailNormalized() { return emailNormalized; }
	public InvitationStatus getStatus() { return status; }
}
