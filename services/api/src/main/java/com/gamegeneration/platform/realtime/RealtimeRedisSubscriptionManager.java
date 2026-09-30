package com.gamegeneration.platform.realtime;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.enabled", havingValue = "true", matchIfMissing = true)
public class RealtimeRedisSubscriptionManager {
	private static final Logger log = LoggerFactory.getLogger(RealtimeRedisSubscriptionManager.class);
	private final RedisMessageListenerContainer listener;

	public RealtimeRedisSubscriptionManager(
			@Qualifier("realtimeRedisListener") RedisMessageListenerContainer listener) {
		this.listener = listener;
	}

	@Scheduled(initialDelayString = "${app.realtime.redis-reconnect-ms:1000}",
			fixedDelayString = "${app.realtime.redis-reconnect-ms:5000}")
	public synchronized void ensureListening() {
		if (listener.isListening()) return;
		try {
			if (listener.isRunning()) listener.stop();
			listener.start();
		} catch (RuntimeException exception) {
			try {
				if (listener.isRunning()) listener.stop();
			} catch (RuntimeException stopFailure) {
				exception.addSuppressed(stopFailure);
			}
			log.warn("Realtime Redis subscription is unavailable; API state remains authoritative and retry will continue: {}",
					exception.getMessage());
		}
	}
}
