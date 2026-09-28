package com.gamegeneration.platform.generation;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.generation")
public record GenerationProperties(String requestTopic, String resultTopic, long outboxPublishDelayMs) {}
