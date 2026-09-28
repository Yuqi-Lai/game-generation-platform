package com.gamegeneration.platform.pack;

import org.apache.kafka.clients.admin.NewTopic;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.TopicBuilder;

@Configuration
@EnableConfigurationProperties(ContentPackProperties.class)
public class ContentPackKafkaConfig {
	@Bean
	NewTopic contentPackExportRequestTopic(ContentPackProperties properties) {
		return TopicBuilder.name(properties.requestTopic()).partitions(3).replicas(1).build();
	}
	@Bean
	NewTopic contentPackExportResultTopic(ContentPackProperties properties) {
		return TopicBuilder.name(properties.resultTopic()).partitions(3).replicas(1).build();
	}
}
