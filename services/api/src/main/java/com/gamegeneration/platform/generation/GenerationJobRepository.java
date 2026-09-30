package com.gamegeneration.platform.generation;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.time.Instant;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GenerationJobRepository extends JpaRepository<GenerationJob, UUID> {
	List<GenerationJob> findAllByProjectIdOrderByCreatedAtDesc(UUID projectId);

	List<GenerationJob> findAllByProjectIdOrderByCreatedAtDesc(UUID projectId, Pageable pageable);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select job from GenerationJob job where job.id = :id")
	Optional<GenerationJob> findForUpdate(@Param("id") UUID id);

	Optional<GenerationJob> findByProjectIdAndRequestedByIdAndRequestIdempotencyKey(
			UUID projectId, UUID requestedById, UUID requestIdempotencyKey);

	@Query("select job.id from GenerationJob job where job.status in :statuses and job.updatedAt < :cutoff")
	List<UUID> findStaleIds(@Param("statuses") List<GenerationJobStatus> statuses,
			@Param("cutoff") Instant cutoff);

	@Query("select job.id from GenerationJob job where job.status = :status and job.cancelRequestedAt < :cutoff")
	List<UUID> findCancellationIds(@Param("status") GenerationJobStatus status,
			@Param("cutoff") Instant cutoff);
}
