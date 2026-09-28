package com.gamegeneration.platform.pack;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContentPackExportResultProcessor {
	private final ObjectMapper objectMapper;
	private final ContentPackRepository packs;
	private final ExportJobRepository jobs;
	private final ExportInboxEventRepository inbox;
	private final ContentPackProperties properties;

	public ContentPackExportResultProcessor(ObjectMapper objectMapper, ContentPackRepository packs,
			ExportJobRepository jobs, ExportInboxEventRepository inbox, ContentPackProperties properties) {
		this.objectMapper = objectMapper;
		this.packs = packs;
		this.jobs = jobs;
		this.inbox = inbox;
		this.properties = properties;
	}

	@Transactional
	public void process(String payload) {
		JsonNode tree = objectMapper.readTree(payload);
		UUID eventId = UUID.fromString(tree.required("eventId").asText());
		String eventType = tree.required("eventType").asText();
		var duplicate = inbox.findForUpdate(eventId);
		if (duplicate.isPresent()) {
			duplicate.get().duplicateReceived();
			return;
		}
		switch (eventType) {
			case ContentPackEvents.STARTED -> started(eventId,
					objectMapper.treeToValue(tree, ContentPackEvents.Started.class));
			case ContentPackEvents.SUCCEEDED -> succeeded(eventId,
					objectMapper.treeToValue(tree, ContentPackEvents.Succeeded.class));
			case ContentPackEvents.FAILED -> failed(eventId,
					objectMapper.treeToValue(tree, ContentPackEvents.Failed.class));
			default -> throw new IllegalArgumentException("Unsupported content pack export event: " + eventType);
		}
	}

	private void started(UUID eventId, ContentPackEvents.Started event) {
		var context = context(eventId, event.eventType(), event.exportJobId(), event.packId(), event.executionKey());
		if (context == null || terminal(eventId, event.eventType(), context)) return;
		context.job().start(event.workerExecutionId());
		record(eventId, event.eventType(), context.job().getId(), "ACCEPTED", null);
	}

	private void succeeded(UUID eventId, ContentPackEvents.Succeeded event) {
		var context = context(eventId, event.eventType(), event.exportJobId(), event.packId(), event.executionKey());
		if (context == null || terminal(eventId, event.eventType(), context)) return;
		if (!context.job().getArtifactKey().equals(event.artifactKey())
				|| !properties.artifactBucket().equals(event.artifactBucket())) {
			context.job().fail(event.workerExecutionId(), "EXPORT_ARTIFACT_MISMATCH",
					"Worker returned an unexpected artifact location");
			context.pack().fail();
			record(eventId, event.eventType(), context.job().getId(), "REJECTED", "Unexpected artifact location");
			return;
		}
		context.job().succeed(event.workerExecutionId(), event.artifactBucket(), event.artifactKey(),
				event.contentType(), event.sizeBytes(), event.sha256());
		context.pack().exported();
		record(eventId, event.eventType(), context.job().getId(), "ACCEPTED", null);
	}

	private void failed(UUID eventId, ContentPackEvents.Failed event) {
		var context = context(eventId, event.eventType(), event.exportJobId(), event.packId(), event.executionKey());
		if (context == null || terminal(eventId, event.eventType(), context)) return;
		context.job().fail(event.workerExecutionId(), event.failureCode(), event.failureMessage());
		context.pack().fail();
		record(eventId, event.eventType(), context.job().getId(), "ACCEPTED", null);
	}

	private ExportContext context(UUID eventId, String eventType, UUID jobId, UUID packId, UUID executionKey) {
		var pack = packs.findForUpdate(packId).orElse(null);
		var job = jobs.findForUpdate(jobId).orElse(null);
		if (pack == null || job == null || !job.getContentPack().getId().equals(packId)
				|| !job.getExecutionKey().equals(executionKey)) {
			record(eventId, eventType, job == null ? null : job.getId(), "CORRELATION_REJECTED",
					"Unknown or mismatched pack export job");
			return null;
		}
		return new ExportContext(pack, job);
	}

	private boolean terminal(UUID eventId, String eventType, ExportContext context) {
		if (context.job().getStatus().isTerminal() || context.pack().getStatus() != ContentPackStatus.EXPORTING) {
			record(eventId, eventType, context.job().getId(), "LATE_TERMINAL_RESULT",
					"Result ignored because pack is " + context.pack().getStatus());
			return true;
		}
		return false;
	}

	private void record(UUID eventId, String eventType, UUID jobId, String disposition, String detail) {
		inbox.save(new ExportInboxEvent(eventId, eventType, jobId, disposition, detail));
	}
	private record ExportContext(ContentPack pack, ExportJob job) {}
}
