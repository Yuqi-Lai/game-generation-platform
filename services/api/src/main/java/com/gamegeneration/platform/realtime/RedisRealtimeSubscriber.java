package com.gamegeneration.platform.realtime;

import java.nio.charset.StandardCharsets;
import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;

public class RedisRealtimeSubscriber implements MessageListener {
	private static final Logger log = LoggerFactory.getLogger(RedisRealtimeSubscriber.class);
	private final ObjectMapper objectMapper;
	private final ProjectSseRegistry registry;

	public RedisRealtimeSubscriber(ObjectMapper objectMapper, ProjectSseRegistry registry) {
		this.objectMapper = objectMapper;
		this.registry = registry;
	}

	@Override
	public void onMessage(Message message, byte[] pattern) {
		try {
			var event = objectMapper.readValue(new String(message.getBody(), StandardCharsets.UTF_8), RealtimeEvent.class);
			registry.broadcast(event);
		} catch (RuntimeException exception) {
			log.warn("Ignoring malformed realtime Redis message", exception);
		}
	}
}
