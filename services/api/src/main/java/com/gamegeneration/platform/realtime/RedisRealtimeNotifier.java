package com.gamegeneration.platform.realtime;

import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Component
@ConditionalOnProperty(name = "app.realtime.enabled", havingValue = "true", matchIfMissing = true)
public class RedisRealtimeNotifier implements RealtimeNotifier {
	private static final Logger log = LoggerFactory.getLogger(RedisRealtimeNotifier.class);
	private final StringRedisTemplate redis;
	private final ObjectMapper objectMapper;
	private final RealtimeProperties properties;

	public RedisRealtimeNotifier(StringRedisTemplate redis, ObjectMapper objectMapper,
			RealtimeProperties properties) {
		this.redis = redis;
		this.objectMapper = objectMapper;
		this.properties = properties;
	}

	@Override
	public void afterCommit(RealtimeEvent event) {
		if (TransactionSynchronizationManager.isSynchronizationActive()
				&& TransactionSynchronizationManager.isActualTransactionActive()) {
			TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
				@Override public void afterCommit() { publishBestEffort(event); }
			});
			return;
		}
		publishBestEffort(event);
	}

	void publishBestEffort(RealtimeEvent event) {
		try {
			redis.convertAndSend(ProjectEventChannel.forProject(properties.channelPrefix(), event.projectId()),
					objectMapper.writeValueAsString(event));
		} catch (RuntimeException exception) {
			log.warn("Realtime Redis publish failed for project {} and event {}; PostgreSQL state is unaffected",
					event.projectId(), event.eventType(), exception);
		}
	}
}
