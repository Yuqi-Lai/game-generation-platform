package com.gamegeneration.platform.realtime;

import java.util.UUID;

public final class ProjectEventChannel {
	private ProjectEventChannel() {}

	public static String forProject(String prefix, UUID projectId) {
		return prefix + ":" + projectId + ":events";
	}

	public static String pattern(String prefix) {
		return prefix + ":*:events";
	}
}
