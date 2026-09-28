package com.gamegeneration.platform.credit;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class CreditApi {
	private CreditApi() {}

	public record BalanceResponse(UUID projectId, long totalGranted, long reserved,
			long consumed, long available, long generationCost, Instant updatedAt) {}
	public record LedgerEntryResponse(UUID id, UUID generationJobId, String type,
			long amount, String idempotencyKey, Instant createdAt) {}
	public record LedgerResponse(List<LedgerEntryResponse> entries) {}
}
