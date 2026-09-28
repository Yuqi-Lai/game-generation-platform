package com.gamegeneration.platform.outbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "outbox_event")
public class OutboxEvent {
	@Id private UUID id;
	@Column(name = "aggregate_type", nullable = false, length = 100) private String aggregateType;
	@Column(name = "aggregate_id", nullable = false) private UUID aggregateId;
	@Column(name = "event_type", nullable = false, length = 160) private String eventType;
	@Column(nullable = false) private String topic;
	@Column(name = "event_key", nullable = false) private String eventKey;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false, columnDefinition = "jsonb") private String payload;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "published_at") private Instant publishedAt;
	@Column(name = "publish_attempts", nullable = false) private int publishAttempts;
	@Column(name = "last_error", length = 1000) private String lastError;

	protected OutboxEvent() {}
	public OutboxEvent(UUID id, String aggregateType, UUID aggregateId, String eventType,
			String topic, String eventKey, String payload) {
		this.id = id;
		this.aggregateType = aggregateType;
		this.aggregateId = aggregateId;
		this.eventType = eventType;
		this.topic = topic;
		this.eventKey = eventKey;
		this.payload = payload;
		this.createdAt = Instant.now();
	}
	public void published() { publishedAt = Instant.now(); lastError = null; publishAttempts++; }
	public void failed(Exception exception) {
		publishAttempts++;
		String message = exception.getMessage() == null ? exception.getClass().getSimpleName() : exception.getMessage();
		lastError = message.substring(0, Math.min(1000, message.length()));
	}
	public UUID getId() { return id; }
	public String getTopic() { return topic; }
	public String getEventKey() { return eventKey; }
	public String getPayload() { return payload; }
}
