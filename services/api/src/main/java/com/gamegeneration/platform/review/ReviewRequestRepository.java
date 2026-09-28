package com.gamegeneration.platform.review;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReviewRequestRepository extends JpaRepository<ReviewRequest, UUID> {
	long countByContentVersionId(UUID contentVersionId);
	Optional<ReviewRequest> findByContentVersionIdAndSubmitIdempotencyKey(
			UUID contentVersionId, UUID submitIdempotencyKey);
	Optional<ReviewRequest> findFirstByContentVersionIdOrderByRequestNumberDesc(UUID contentVersionId);

	@Query("select coalesce(max(request.requestNumber), 0) from ReviewRequest request "
			+ "where request.contentVersion.id = :versionId")
	int findMaxRequestNumber(@Param("versionId") UUID versionId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select request from ReviewRequest request where request.id = :requestId")
	Optional<ReviewRequest> findForUpdate(@Param("requestId") UUID requestId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select request from ReviewRequest request where request.contentVersion.id = :versionId "
			+ "and request.status = :status")
	Optional<ReviewRequest> findByVersionAndStatusForUpdate(@Param("versionId") UUID versionId,
			@Param("status") ReviewRequestStatus status);
}
