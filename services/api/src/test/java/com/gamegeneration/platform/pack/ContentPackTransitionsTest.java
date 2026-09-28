package com.gamegeneration.platform.pack;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;

class ContentPackTransitionsTest {
	@Test
	void allowsTheMinimalExportLifecycle() {
		assertThat(ContentPackTransitions.canTransition(ContentPackStatus.DRAFT, ContentPackStatus.READY)).isTrue();
		assertThat(ContentPackTransitions.canTransition(ContentPackStatus.READY, ContentPackStatus.EXPORTING)).isTrue();
		assertThat(ContentPackTransitions.canTransition(ContentPackStatus.EXPORTING, ContentPackStatus.EXPORTED)).isTrue();
		assertThat(ContentPackTransitions.canTransition(ContentPackStatus.EXPORTING, ContentPackStatus.FAILED)).isTrue();
	}

	@Test
	void rejectsCompositionOrExportStateReopening() {
		assertThatThrownBy(() -> ContentPackTransitions.require(ContentPackStatus.DRAFT, ContentPackStatus.EXPORTING))
				.isInstanceOf(IllegalStateException.class);
		assertThatThrownBy(() -> ContentPackTransitions.require(ContentPackStatus.EXPORTED, ContentPackStatus.DRAFT))
				.isInstanceOf(IllegalStateException.class);
	}
}
