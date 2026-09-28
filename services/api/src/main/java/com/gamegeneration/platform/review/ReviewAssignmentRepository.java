package com.gamegeneration.platform.review;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewAssignmentRepository extends JpaRepository<ReviewAssignment, UUID> {
	List<ReviewAssignment> findAllByReviewRequestIdOrderByCreatedAtAsc(UUID reviewRequestId);
	Optional<ReviewAssignment> findByReviewRequestIdAndReviewerId(UUID reviewRequestId, UUID reviewerId);
	long countByReviewRequestId(UUID reviewRequestId);
}
