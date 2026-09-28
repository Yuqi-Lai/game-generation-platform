package com.gamegeneration.platform.generation;

import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
public class GenerationResultConsumer {
	private final GenerationResultProcessor processor;

	public GenerationResultConsumer(GenerationResultProcessor processor) {
		this.processor = processor;
	}

	@KafkaListener(topics = "${app.generation.result-topic}")
	public void consume(String payload) throws Exception {
		processor.process(payload);
	}
}
