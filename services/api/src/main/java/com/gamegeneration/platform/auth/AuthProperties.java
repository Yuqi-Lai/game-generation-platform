package com.gamegeneration.platform.auth;

import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public record AuthProperties(Auth auth, Cors cors) {
	public record Auth(String audience, List<String> bootstrapInvitedEmails) {}
	public record Cors(List<String> allowedOrigins) {}
}
