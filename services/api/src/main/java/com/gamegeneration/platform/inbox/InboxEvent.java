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
	@Column(name = "job_id") private UUID jobId;
	@Column(name = "attempt_id") private UUID attemptId;
	@Column(length = 60) private String disposition;
	@Column(length = 1000) private String detail;
	@Column(name = "duplicate_count", nullable = false) private int duplicateCount;
	@Column(name = "processed_at", nullable = false) private Instant processedAt;
	@Column(name = "last_received_at", nullable = false) private Instant lastReceivedAt;
	protected InboxEvent() {}
	public InboxEvent(UUID eventId, String eventType, UUID jobId, UUID attemptId,
			String disposition, String detail) {
		this.eventId = eventId;
		this.eventType = eventType;
		this.jobId = jobId;
		this.attemptId = attemptId;
		this.disposition = disposition;
		this.detail = detail;
		this.processedAt = this.lastReceivedAt = Instant.now();
	}
	public void duplicateReceived() { duplicateCount++; lastReceivedAt = Instant.now(); }
}
