package com.gamegeneration.platform.credit;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CreditLedgerRepository extends JpaRepository<CreditLedgerEntry, UUID> {
	Optional<CreditLedgerEntry> findByIdempotencyKey(String idempotencyKey);
	List<CreditLedgerEntry> findAllByProjectIdOrderByCreatedAtDesc(UUID projectId, Pageable pageable);
	long countByGenerationJobIdAndMovementType(UUID generationJobId, CreditMovementType movementType);
}
