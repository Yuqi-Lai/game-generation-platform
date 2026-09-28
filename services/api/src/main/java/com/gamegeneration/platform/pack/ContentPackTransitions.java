package com.gamegeneration.platform.pack;

import java.util.EnumMap;
import java.util.EnumSet;
import java.util.Map;

public final class ContentPackTransitions {
	private static final Map<ContentPackStatus, EnumSet<ContentPackStatus>> ALLOWED =
			new EnumMap<>(ContentPackStatus.class);

	static {
		ALLOWED.put(ContentPackStatus.DRAFT, EnumSet.of(ContentPackStatus.READY));
		ALLOWED.put(ContentPackStatus.READY, EnumSet.of(ContentPackStatus.EXPORTING));
		ALLOWED.put(ContentPackStatus.EXPORTING, EnumSet.of(ContentPackStatus.EXPORTED, ContentPackStatus.FAILED));
	}

	private ContentPackTransitions() {}

	public static boolean canTransition(ContentPackStatus from, ContentPackStatus to) {
		return from == to || ALLOWED.getOrDefault(from, EnumSet.noneOf(ContentPackStatus.class)).contains(to);
	}

	public static void require(ContentPackStatus from, ContentPackStatus to) {
		if (!canTransition(from, to)) {
			throw new IllegalStateException("Invalid content pack transition: " + from + " -> " + to);
		}
	}
}
