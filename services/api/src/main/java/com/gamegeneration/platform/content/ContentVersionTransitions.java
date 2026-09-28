package com.gamegeneration.platform.content;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

public final class ContentVersionTransitions {
	private static final Map<ContentVersionStatus, EnumSet<ContentVersionStatus>> ALLOWED =
			new EnumMap<>(ContentVersionStatus.class);

	static {
		ALLOWED.put(ContentVersionStatus.DRAFT, EnumSet.of(ContentVersionStatus.IN_REVIEW));
		ALLOWED.put(ContentVersionStatus.CHANGES_REQUESTED, EnumSet.of(ContentVersionStatus.IN_REVIEW));
		ALLOWED.put(ContentVersionStatus.IN_REVIEW, EnumSet.of(
				ContentVersionStatus.APPROVED,
				ContentVersionStatus.CHANGES_REQUESTED,
				ContentVersionStatus.SUPERSEDED));
	}

	private ContentVersionTransitions() {}

	public static boolean canTransition(ContentVersionStatus from, ContentVersionStatus to) {
		return from == to || ALLOWED.getOrDefault(from, EnumSet.noneOf(ContentVersionStatus.class)).contains(to);
	}

	public static void require(ContentVersionStatus from, ContentVersionStatus to) {
		if (!canTransition(from, to)) {
			throw new IllegalStateException("Invalid content version transition: " + from + " -> " + to);
		}
	}
}
