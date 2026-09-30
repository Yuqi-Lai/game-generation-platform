package com.gamegeneration.platform.realtime;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.listener.ChannelTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.ObjectMapper;

@Testcontainers(disabledWithoutDocker = true)
class RedisPubSubIntegrationTest {
	@Container
	static final GenericContainer<?> REDIS = new GenericContainer<>(DockerImageName.parse("redis:7.4-alpine"))
			.withExposedPorts(6379).withStartupTimeout(Duration.ofSeconds(30));

	@Test
	void publishesAndSubscribesOnTheProjectScopedChannel() throws Exception {
		var connectionFactory = new LettuceConnectionFactory(REDIS.getHost(), REDIS.getMappedPort(6379));
		connectionFactory.afterPropertiesSet();
		var template = new StringRedisTemplate(connectionFactory);
		template.afterPropertiesSet();
		var listener = new RedisMessageListenerContainer();
		listener.setConnectionFactory(connectionFactory);
		var received = new java.util.concurrent.atomic.AtomicReference<String>();
		var latch = new CountDownLatch(1);
		var projectId = UUID.randomUUID();
		var channel = ProjectEventChannel.forProject("project", projectId);
		listener.addMessageListener((message, pattern) -> {
			received.set(new String(message.getBody(), StandardCharsets.UTF_8));
			latch.countDown();
		}, new ChannelTopic(channel));
		listener.afterPropertiesSet();
		listener.start();
		try {
			var notifier = new RedisRealtimeNotifier(template, new ObjectMapper(),
					new RealtimeProperties(true, "project", 25_000, 1_800_000));
			notifier.afterCommit(RealtimeEvent.now(RealtimeEventTypes.REVIEW_UPDATED,
					projectId, UUID.randomUUID(), Map.of("status", "OPEN")));
			assertThat(latch.await(5, TimeUnit.SECONDS)).isTrue();
			assertThat(received.get()).contains("review.updated").contains(projectId.toString());
		} finally {
			listener.stop();
			connectionFactory.destroy();
		}
	}
}
