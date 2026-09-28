package com.gamegeneration.platform.user;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user", uniqueConstraints = @UniqueConstraint(
		name = "uq_app_user_external_identity", columnNames = {"auth_issuer", "auth_subject"}))
public class AppUser {
	@Id
	private UUID id;

	@Column(name = "auth_issuer", nullable = false, length = 512)
	private String authIssuer;

	@Column(name = "auth_subject", nullable = false)
	private String authSubject;

	@Column(length = 320)
	private String email;

	@Column(name = "email_verified", nullable = false)
	private boolean emailVerified;

	@Column(name = "display_name", length = 200)
	private String displayName;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private UserStatus status;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Version
	@Column(name = "row_version", nullable = false)
	private long version;

	protected AppUser() {}

	public AppUser(String authIssuer, String authSubject, String email, boolean emailVerified, String displayName) {
		this.id = UUID.randomUUID();
		this.authIssuer = authIssuer;
		this.authSubject = authSubject;
		this.email = email;
		this.emailVerified = emailVerified;
		this.displayName = displayName;
		this.status = UserStatus.ACTIVE;
	}

	@PrePersist
	void prePersist() {
		var now = Instant.now();
		createdAt = now;
		updatedAt = now;
	}

	@PreUpdate
	void preUpdate() {
		updatedAt = Instant.now();
	}

	public void synchronizeProfile(String email, boolean verified, String name) {
		this.email = email;
		this.emailVerified = verified;
		this.displayName = name;
	}

	public UUID getId() { return id; }
	public String getAuthIssuer() { return authIssuer; }
	public String getAuthSubject() { return authSubject; }
	public String getEmail() { return email; }
	public boolean isEmailVerified() { return emailVerified; }
	public String getDisplayName() { return displayName; }
	public UserStatus getStatus() { return status; }
	public Instant getCreatedAt() { return createdAt; }
	public Instant getUpdatedAt() { return updatedAt; }
	public long getVersion() { return version; }
}
