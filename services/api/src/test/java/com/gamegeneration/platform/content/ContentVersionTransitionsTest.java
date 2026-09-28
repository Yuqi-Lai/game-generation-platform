package com.gamegeneration.platform.content;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ContentVersionTransitionsTest {
	@Test
	void allowsOnlyTheDefinedReviewLifecycle() {
		assertThat(ContentVersionTransitions.canTransition(ContentVersionStatus.DRAFT,
				ContentVersionStatus.IN_REVIEW)).isTrue();
		assertThat(ContentVersionTransitions.canTransition(ContentVersionStatus.CHANGES_REQUESTED,
				ContentVersionStatus.IN_REVIEW)).isTrue();
		assertThat(ContentVersionTransitions.canTransition(ContentVersionStatus.IN_REVIEW,
				ContentVersionStatus.APPROVED)).isTrue();
		assertThat(ContentVersionTransitions.canTransition(ContentVersionStatus.IN_REVIEW,
				ContentVersionStatus.CHANGES_REQUESTED)).isTrue();
		assertThat(ContentVersionTransitions.canTransition(ContentVersionStatus.IN_REVIEW,
				ContentVersionStatus.SUPERSEDED)).isTrue();
	}

	@Test
	void rejectsSkippingReviewAndReopeningTerminalVersions() {
		assertThatThrownBy(() -> ContentVersionTransitions.require(ContentVersionStatus.DRAFT,
				ContentVersionStatus.APPROVED)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> ContentVersionTransitions.require(ContentVersionStatus.APPROVED,
				ContentVersionStatus.IN_REVIEW)).isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> ContentVersionTransitions.require(ContentVersionStatus.SUPERSEDED,
				ContentVersionStatus.DRAFT)).isInstanceOf(IllegalStateException.class);
	}
}
