package com.gamegeneration.platform.review;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ReviewDecisionRepository extends JpaRepository<ReviewDecision, UUID> {
	long countByReviewRequestId(UUID reviewRequestId);
	List<ReviewDecision> findAllByReviewRequestIdOrderByCreatedAtAsc(UUID reviewRequestId);
	Optional<ReviewDecision> findByReviewRequestIdAndReviewerId(UUID reviewRequestId, UUID reviewerId);
	Optional<ReviewDecision> findByReviewerIdAndRequestIdempotencyKey(UUID reviewerId, UUID requestIdempotencyKey);
	long countByReviewRequestIdAndDecision(UUID reviewRequestId, ReviewDecisionType decision);
}
