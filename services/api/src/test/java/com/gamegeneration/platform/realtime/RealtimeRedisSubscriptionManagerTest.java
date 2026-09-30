package com.gamegeneration.platform.realtime;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

class RealtimeRedisSubscriptionManagerTest {
	private final RedisMessageListenerContainer listener =
			org.mockito.Mockito.mock(RedisMessageListenerContainer.class);
	private final RealtimeRedisSubscriptionManager manager = new RealtimeRedisSubscriptionManager(listener);

	@Test
	void leavesAnActiveSubscriptionAlone() {
		when(listener.isListening()).thenReturn(true);

		manager.ensureListening();

		verify(listener, never()).start();
	}

	@Test
	void failedConnectionIsStoppedSoTheNextScheduledAttemptCanRetry() {
		when(listener.isListening()).thenReturn(false);
		when(listener.isRunning()).thenReturn(false, true);
		doThrow(new IllegalStateException("redis unavailable")).when(listener).start();

		manager.ensureListening();

		var calls = inOrder(listener);
		calls.verify(listener).isListening();
		calls.verify(listener).isRunning();
		calls.verify(listener).start();
		calls.verify(listener).isRunning();
		calls.verify(listener).stop();
	}
}
