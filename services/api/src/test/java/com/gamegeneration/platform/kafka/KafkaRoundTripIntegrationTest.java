package com.gamegeneration.platform.kafka;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import com.gamegeneration.platform.outbox.OutboxEvent;
import com.gamegeneration.platform.outbox.OutboxEventRepository;
import com.gamegeneration.platform.outbox.OutboxPublisher;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.annotation.KafkaListener;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.kafka.ConfluentKafkaContainer;

/**
 * The one hop the rest of the suite deliberately skips.
 *
 * {@code PostgresIntegrationTest} disables the listener and parks the outbox
 * poller an hour out, then asserts on {@code outbox_event} rows. That is the
 * right call for database correctness — it keeps those assertions independent
 * of broker availability — but it leaves the transport itself unexercised:
 * nothing proved that {@link OutboxPublisher} reaches a broker, that the
 * payload survives serialization, or that the key lands where partitioning
 * and result correlation expect it.
 *
 * This runs against a real broker in a container. An earlier attempt used
 * {@code @EmbeddedKafka}, which needs no container but whose KRaft broker died
 * mid-test here and took the JDBC pool down with it.
 */
@SpringBootTest(properties = {
		"app.auth.bootstrap-invited-emails=",
		"spring.task.scheduling.enabled=false",
		"app.realtime.enabled=false",
		/* The poller is driven by hand, so assertions are not racing it. */
		"app.generation.outbox-publish-delay-ms=3600000"
})
@Testcontainers
@Import(KafkaRoundTripIntegrationTest.RequestTopicProbe.class)
class KafkaRoundTripIntegrationTest {
	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

	/*
	 * Confluent's image rather than apache/kafka: the latter would not reach a
	 * running state on arm64 here, and this one publishes a native build.
	 */
	@Container
	@ServiceConnection
	static final ConfluentKafkaContainer KAFKA =
			new ConfluentKafkaContainer("confluentinc/cp-kafka:7.8.0");

	@Autowired OutboxEventRepository outbox;
	@Autowired OutboxPublisher publisher;
	@Autowired RequestTopicProbe probe;
	@Autowired JdbcTemplate jdbc;
	@Value("${app.generation.request-topic}") String requestTopic;

	/** Reads the request topic the Python worker subscribes to. */
	@TestConfiguration
	static class RequestTopicProbe {
		final List<String> keys = new CopyOnWriteArrayList<>();
		final List<String> payloads = new CopyOnWriteArrayList<>();

		@KafkaListener(topics = "${app.generation.request-topic}", groupId = "kafka-round-trip-probe")
		void consume(ConsumerRecord<String, String> record) {
			keys.add(record.key());
			payloads.add(record.value());
		}
	}

	private UUID enqueue(String topic) {
		var jobId = UUID.randomUUID();
		outbox.saveAndFlush(new OutboxEvent(UUID.randomUUID(), "GenerationJob", jobId,
				"GenerationExecutionRequested", topic, jobId.toString(),
				"{\"eventType\":\"GenerationExecutionRequested\",\"jobId\":\"" + jobId + "\"}"));
		return jobId;
	}

	@Test
	void outboxRowsReachTheBrokerOnTheTopicAndKeyTheWorkerExpects() {
		var jobId = enqueue(requestTopic);

		publisher.publishAvailable();

		await().atMost(Duration.ofSeconds(60)).untilAsserted(() -> {
			assertThat(probe.payloads).anySatisfy(payload ->
					assertThat(payload).contains(jobId.toString()));
			/*
			 * The key is the job id. Worker partitioning and the API's result
			 * correlation both rely on it, so an absent key would still
			 * deliver and still be wrong.
			 */
			assertThat(probe.keys).contains(jobId.toString());
		});
	}

	@Test
	void aPublishedRowIsMarkedSoAndIsNotSentTwice() {
		var jobId = enqueue(requestTopic);

		publisher.publishAvailable();
		await().atMost(Duration.ofSeconds(60))
				.untilAsserted(() -> assertThat(probe.keys).contains(jobId.toString()));

		/*
		 * At-least-once is the contract, but the row has to be marked or every
		 * poll would resend the whole backlog forever. Read the column
		 * directly: the entity exposes no publishedAt getter, and widening
		 * production API just to let a test look is the wrong trade.
		 */
		assertThat(jdbc.queryForObject(
				"select count(*) from outbox_event where event_key = ? and published_at is null",
				Integer.class, jobId.toString())).isZero();

		var delivered = probe.keys.stream().filter(jobId.toString()::equals).count();
		publisher.publishAvailable();
		assertThat(probe.keys.stream().filter(jobId.toString()::equals).count())
				.isEqualTo(delivered);
	}
}
