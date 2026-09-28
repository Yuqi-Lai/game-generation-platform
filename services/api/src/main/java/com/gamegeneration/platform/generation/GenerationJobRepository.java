package com.gamegeneration.platform.generation;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GenerationJobRepository extends JpaRepository<GenerationJob, UUID> {
	List<GenerationJob> findAllByProjectIdOrderByCreatedAtDesc(UUID projectId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select job from GenerationJob job where job.id = :id")
	Optional<GenerationJob> findForUpdate(@Param("id") UUID id);
}
