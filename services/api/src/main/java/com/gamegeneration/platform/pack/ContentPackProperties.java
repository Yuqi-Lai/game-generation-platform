package com.gamegeneration.platform.pack;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.content-pack")
public record ContentPackProperties(String requestTopic, String resultTopic, String artifactBucket) {}
