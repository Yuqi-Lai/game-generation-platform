package com.gamegeneration.platform.generation;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface GenerationAttemptRepository extends JpaRepository<GenerationAttempt, UUID> {
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select attempt from GenerationAttempt attempt where attempt.executionKey = :executionKey")
	Optional<GenerationAttempt> findByExecutionKeyForUpdate(@Param("executionKey") UUID executionKey);
}
