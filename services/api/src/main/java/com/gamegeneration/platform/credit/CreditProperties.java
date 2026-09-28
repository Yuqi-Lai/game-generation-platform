package com.gamegeneration.platform.credit;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.credits")
public record CreditProperties(long initialProjectGrant, long generationCost, int ledgerLimit) {
	public CreditProperties {
		if (initialProjectGrant < 0) throw new IllegalArgumentException("Initial credit grant cannot be negative");
		if (generationCost <= 0) throw new IllegalArgumentException("Generation cost must be positive");
		if (ledgerLimit <= 0 || ledgerLimit > 200) throw new IllegalArgumentException("Ledger limit must be between 1 and 200");
	}
}
