package com.gamegeneration.platform.generation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class GenerationJobTransitionsTest {
	@Test
	void allowsDefinedLifecycleTransitionsAndIdempotentSelfTransitions() {
		assertThat(GenerationJobTransitions.canTransition(GenerationJobStatus.QUEUED,
				GenerationJobStatus.RUNNING)).isTrue();
		assertThat(GenerationJobTransitions.canTransition(GenerationJobStatus.RUNNING,
				GenerationJobStatus.QUEUED)).isTrue();
		assertThat(GenerationJobTransitions.canTransition(GenerationJobStatus.CANCEL_REQUESTED,
				GenerationJobStatus.CANCELLED)).isTrue();
		assertThat(GenerationJobTransitions.canTransition(GenerationJobStatus.SUCCEEDED,
				GenerationJobStatus.SUCCEEDED)).isTrue();
	}

	@Test
	void rejectsReopeningOrOverwritingTerminalStates() {
		assertThatThrownBy(() -> GenerationJobTransitions.require(GenerationJobStatus.TIMED_OUT,
				GenerationJobStatus.SUCCEEDED))
				.isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> GenerationJobTransitions.require(GenerationJobStatus.CANCELLED,
				GenerationJobStatus.RUNNING))
				.isInstanceOf(IllegalStateException.class);
	}
}
