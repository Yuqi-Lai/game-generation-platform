package com.gamegeneration.platform.inbox;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "inbox_event")
public class InboxEvent {
	@Id @Column(name = "event_id") private UUID eventId;
	@Column(name = "event_type", nullable = false, length = 160) private String eventType;
	@Column(name = "processed_at", nullable = false) private Instant processedAt;
	protected InboxEvent() {}
	public InboxEvent(UUID eventId, String eventType) {
		this.eventId = eventId;
		this.eventType = eventType;
		this.processedAt = Instant.now();
	}
}
