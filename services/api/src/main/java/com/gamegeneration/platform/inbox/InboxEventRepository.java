package com.gamegeneration.platform.inbox;

import java.util.UUID;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InboxEventRepository extends JpaRepository<InboxEvent, UUID> {
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select event from InboxEvent event where event.eventId = :id")
	Optional<InboxEvent> findForUpdate(@Param("id") UUID id);
}
