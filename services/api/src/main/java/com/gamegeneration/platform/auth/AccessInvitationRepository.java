package com.gamegeneration.platform.auth;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AccessInvitationRepository extends JpaRepository<AccessInvitation, UUID> {
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select invitation from AccessInvitation invitation "
			+ "where invitation.emailNormalized = :email and invitation.status = 'PENDING'")
	Optional<AccessInvitation> findPendingForUpdate(@Param("email") String emailNormalized);

	boolean existsByEmailNormalizedAndStatus(String emailNormalized, InvitationStatus status);
}
