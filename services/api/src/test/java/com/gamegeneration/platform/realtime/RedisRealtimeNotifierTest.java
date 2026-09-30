package com.gamegeneration.platform.realtime;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.ObjectMapper;

class RedisRealtimeNotifierTest {
	private final StringRedisTemplate redis = org.mockito.Mockito.mock(StringRedisTemplate.class);
	private final RealtimeProperties properties = new RealtimeProperties(true, "project", 25_000, 1_800_000);
	private final RedisRealtimeNotifier notifier = new RedisRealtimeNotifier(redis, new ObjectMapper(), properties);

	@AfterEach
	void clearTransactionState() {
		if (TransactionSynchronizationManager.isSynchronizationActive()) {
			TransactionSynchronizationManager.clearSynchronization();
		}
		TransactionSynchronizationManager.setActualTransactionActive(false);
	}

	@Test
	void publishesOnlyAfterTheDatabaseTransactionCommits() {
		var projectId = UUID.randomUUID();
		var event = RealtimeEvent.now(RealtimeEventTypes.GENERATION_JOB_UPDATED,
				projectId, UUID.randomUUID(), Map.of("status", "RUNNING"));
		TransactionSynchronizationManager.initSynchronization();
		TransactionSynchronizationManager.setActualTransactionActive(true);

		notifier.afterCommit(event);
		verify(redis, never()).convertAndSend(anyString(), anyString());

		TransactionSynchronizationManager.getSynchronizations().forEach(synchronization -> synchronization.afterCommit());
		verify(redis).convertAndSend(org.mockito.ArgumentMatchers.eq("project:" + projectId + ":events"), anyString());
	}

	@Test
	void redisFailureDoesNotEscapeIntoBusinessFlow() {
		when(redis.convertAndSend(anyString(), anyString())).thenThrow(new IllegalStateException("redis unavailable"));
		var event = RealtimeEvent.now(RealtimeEventTypes.CREDITS_UPDATED,
				UUID.randomUUID(), UUID.randomUUID(), Map.of("available", 90));
		assertThatCode(() -> notifier.afterCommit(event)).doesNotThrowAnyException();
	}
}
