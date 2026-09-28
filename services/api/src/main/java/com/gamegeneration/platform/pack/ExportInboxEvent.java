package com.gamegeneration.platform.pack;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "export_inbox_event")
public class ExportInboxEvent {
	@Id @Column(name = "event_id") private UUID eventId;
	@Column(name = "event_type", nullable = false, length = 160) private String eventType;
	@Column(name = "export_job_id") private UUID exportJobId;
	@Column(nullable = false, length = 60) private String disposition;
	@Column(length = 1000) private String detail;
	@Column(name = "duplicate_count", nullable = false) private int duplicateCount;
	@Column(name = "processed_at", nullable = false) private Instant processedAt;
	@Column(name = "last_received_at", nullable = false) private Instant lastReceivedAt;
	protected ExportInboxEvent() {}
	public ExportInboxEvent(UUID eventId, String eventType, UUID exportJobId, String disposition, String detail) {
		this.eventId = eventId;
		this.eventType = eventType;
		this.exportJobId = exportJobId;
		this.disposition = disposition;
		this.detail = detail;
	}
	@PrePersist void prePersist() { processedAt = lastReceivedAt = Instant.now(); }
	public void duplicateReceived() { duplicateCount++; lastReceivedAt = Instant.now(); }
}
