package com.gamegeneration.platform.realtime;

import tools.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.listener.PatternTopic;
import org.springframework.data.redis.listener.RedisMessageListenerContainer;

@Configuration
@EnableConfigurationProperties(RealtimeProperties.class)
public class RealtimeConfig {
	@Bean
	@ConditionalOnProperty(name = "app.realtime.enabled", havingValue = "true", matchIfMissing = true)
	RedisMessageListenerContainer realtimeRedisListener(RedisConnectionFactory connectionFactory,
			ObjectMapper objectMapper, ProjectSseRegistry registry, RealtimeProperties properties) {
		var container = new RedisMessageListenerContainer();
		container.setConnectionFactory(connectionFactory);
		container.setAutoStartup(false);
		container.addMessageListener(new RedisRealtimeSubscriber(objectMapper, registry),
				new PatternTopic(ProjectEventChannel.pattern(properties.channelPrefix())));
		return container;
	}
}
