package com.gamegeneration.platform.pack;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class ContentPackExportResultConsumer {
	private final ContentPackExportResultProcessor processor;
	public ContentPackExportResultConsumer(ContentPackExportResultProcessor processor) { this.processor = processor; }
	@KafkaListener(topics = "${app.content-pack.result-topic}")
	public void consume(String payload) { processor.process(payload); }
}
