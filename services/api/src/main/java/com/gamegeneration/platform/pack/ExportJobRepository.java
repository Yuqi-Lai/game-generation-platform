package com.gamegeneration.platform.pack;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ExportJobRepository extends JpaRepository<ExportJob, UUID> {
	Optional<ExportJob> findByContentPackId(UUID packId);
	Optional<ExportJob> findByContentPackIdAndRequestIdempotencyKey(UUID packId, UUID requestId);
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select job from ExportJob job where job.id = :jobId")
	Optional<ExportJob> findForUpdate(@Param("jobId") UUID jobId);
}
