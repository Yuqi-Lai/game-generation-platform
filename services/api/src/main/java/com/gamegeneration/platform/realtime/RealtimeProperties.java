package com.gamegeneration.platform.realtime;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.realtime")
public record RealtimeProperties(
		boolean enabled,
		String channelPrefix,
		long heartbeatIntervalMs,
		long connectionTimeoutMs) {
	public RealtimeProperties {
		if (channelPrefix == null || channelPrefix.isBlank()) channelPrefix = "project";
		if (heartbeatIntervalMs < 10_000) throw new IllegalArgumentException("Realtime heartbeat must be at least 10 seconds");
		if (connectionTimeoutMs < heartbeatIntervalMs * 2) {
			throw new IllegalArgumentException("Realtime connection timeout must exceed two heartbeat intervals");
		}
	}
}
