package com.gamegeneration.platform.outbox;

import java.util.concurrent.TimeUnit;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class OutboxPublisher {
	private final OutboxEventRepository events;
	private final KafkaTemplate<String, String> kafka;

	public OutboxPublisher(OutboxEventRepository events, KafkaTemplate<String, String> kafka) {
		this.events = events;
		this.kafka = kafka;
	}

	@Scheduled(fixedDelayString = "${app.generation.outbox-publish-delay-ms:1000}")
	@Transactional
	public void publishAvailable() {
		for (var event : events.lockNextUnpublished()) {
			try {
				kafka.send(event.getTopic(), event.getEventKey(), event.getPayload())
						.get(10, TimeUnit.SECONDS);
				event.published();
			} catch (Exception exception) {
				event.failed(exception);
			}
		}
	}
}
