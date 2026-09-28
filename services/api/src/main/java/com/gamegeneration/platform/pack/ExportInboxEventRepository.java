package com.gamegeneration.platform.pack;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExportInboxEventRepository extends JpaRepository<ExportInboxEvent, UUID> {
	long countByExportJobId(UUID exportJobId);
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select event from ExportInboxEvent event where event.eventId = :eventId")
	Optional<ExportInboxEvent> findForUpdate(@Param("eventId") UUID eventId);
}
