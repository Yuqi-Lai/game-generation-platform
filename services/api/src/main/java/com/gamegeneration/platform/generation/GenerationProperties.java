package com.gamegeneration.platform.generation;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.generation")
public record GenerationProperties(
		String requestTopic,
		String retryTopic,
		String resultTopic,
		String dlqTopic,
		int maxAttempts,
		long timeoutSeconds,
		long cancellationGraceSeconds,
		long sweepDelayMs,
		long outboxPublishDelayMs) {}
