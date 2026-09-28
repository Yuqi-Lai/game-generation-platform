package com.gamegeneration.platform.generation;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

public final class GenerationJobTransitions {
	private static final Map<GenerationJobStatus, EnumSet<GenerationJobStatus>> ALLOWED =
			new EnumMap<>(GenerationJobStatus.class);

	static {
		ALLOWED.put(GenerationJobStatus.QUEUED, EnumSet.of(
				GenerationJobStatus.RUNNING, GenerationJobStatus.FAILED,
				GenerationJobStatus.CANCEL_REQUESTED, GenerationJobStatus.TIMED_OUT));
		ALLOWED.put(GenerationJobStatus.RUNNING, EnumSet.of(
				GenerationJobStatus.QUEUED, GenerationJobStatus.SUCCEEDED,
				GenerationJobStatus.FAILED, GenerationJobStatus.CANCEL_REQUESTED,
				GenerationJobStatus.TIMED_OUT));
		ALLOWED.put(GenerationJobStatus.CANCEL_REQUESTED, EnumSet.of(GenerationJobStatus.CANCELLED));
	}

	private GenerationJobTransitions() {}

	public static boolean canTransition(GenerationJobStatus from, GenerationJobStatus to) {
		return from == to || ALLOWED.getOrDefault(from, EnumSet.noneOf(GenerationJobStatus.class)).contains(to);
	}

	public static void require(GenerationJobStatus from, GenerationJobStatus to) {
		if (!canTransition(from, to)) {
			throw new IllegalStateException("Invalid generation job transition: " + from + " -> " + to);
		}
	}
}
