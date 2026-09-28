package com.gamegeneration.platform.generation;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gamegeneration.platform.content.ContentAsset;
import com.gamegeneration.platform.content.ContentAssetRepository;
import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.content.ContentVersionRepository;
import com.gamegeneration.platform.inbox.InboxEvent;
import com.gamegeneration.platform.inbox.InboxEventRepository;
import com.gamegeneration.platform.project.ProjectRepository;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GenerationResultProcessor {
	private final ObjectMapper objectMapper;
	private final InboxEventRepository inbox;
	private final GenerationJobRepository jobs;
	private final GenerationAttemptRepository attempts;
	private final ProjectRepository projects;
	private final ContentVersionRepository versions;
	private final ContentAssetRepository assets;

	public GenerationResultProcessor(ObjectMapper objectMapper, InboxEventRepository inbox,
			GenerationJobRepository jobs, GenerationAttemptRepository attempts,
			ProjectRepository projects, ContentVersionRepository versions,
			ContentAssetRepository assets) {
		this.objectMapper = objectMapper;
		this.inbox = inbox;
		this.jobs = jobs;
		this.attempts = attempts;
		this.projects = projects;
		this.versions = versions;
		this.assets = assets;
	}

	@Transactional
	public void process(String payload) throws Exception {
		JsonNode tree = objectMapper.readTree(payload);
		UUID eventId = UUID.fromString(tree.required("eventId").asText());
		String eventType = tree.required("eventType").asText();
		if (inbox.existsById(eventId)) return;

		switch (eventType) {
			case GenerationEvents.SUCCEEDED -> succeed(eventId,
					objectMapper.treeToValue(tree, GenerationEvents.Succeeded.class));
			case GenerationEvents.FAILED -> fail(eventId,
					objectMapper.treeToValue(tree, GenerationEvents.Failed.class));
			default -> throw new IllegalArgumentException("Unsupported generation result event: " + eventType);
		}
	}

	private void succeed(UUID eventId, GenerationEvents.Succeeded event) {
		var attempt = attempts.findByExecutionKeyForUpdate(event.executionKey())
				.orElseThrow(() -> new IllegalArgumentException("Unknown generation execution"));
		var job = jobs.findForUpdate(event.jobId())
				.orElseThrow(() -> new IllegalArgumentException("Unknown generation job"));
		validateCorrelation(job, attempt, event.attemptId());

		if (job.getStatus() != GenerationJobStatus.QUEUED) {
			inbox.save(new InboxEvent(eventId, event.eventType()));
			return;
		}

		var version = versions.findBySourceGenerationJobId(job.getId()).orElseGet(() -> {
			var project = projects.findForUpdate(job.getProject().getId())
					.orElseThrow(() -> new IllegalArgumentException("Project no longer exists"));
			int nextVersion = versions.findMaxVersionNumber(project.getId()) + 1;
			String title = event.title().substring(0, Math.min(200, event.title().length()));
			return versions.saveAndFlush(new ContentVersion(project, job, nextVersion, title,
					event.content().toString(), job.getRequestedBy()));
		});

		if (assets.findAllByContentVersionIdOrderByCreatedAtAsc(version.getId()).isEmpty()) {
			for (var asset : event.assets()) {
				assets.save(new ContentAsset(version, asset.assetType(), asset.bucket(), asset.key(),
						asset.contentType(), asset.sizeBytes(), asset.sha256(),
						asset.metadata() == null ? "{}" : asset.metadata().toString()));
			}
		}
		attempt.succeed(event.model());
		job.succeed(version);
		inbox.save(new InboxEvent(eventId, event.eventType()));
	}

	private void fail(UUID eventId, GenerationEvents.Failed event) {
		var attempt = attempts.findByExecutionKeyForUpdate(event.executionKey())
				.orElseThrow(() -> new IllegalArgumentException("Unknown generation execution"));
		var job = jobs.findForUpdate(event.jobId())
				.orElseThrow(() -> new IllegalArgumentException("Unknown generation job"));
		validateCorrelation(job, attempt, event.attemptId());
		if (job.getStatus() == GenerationJobStatus.QUEUED) {
			attempt.fail(event.model(), event.failureCode(), event.failureMessage());
			job.fail(event.failureCode(), event.failureMessage());
		}
		inbox.save(new InboxEvent(eventId, event.eventType()));
	}

	private static void validateCorrelation(GenerationJob job, GenerationAttempt attempt, UUID attemptId) {
		if (!attempt.getId().equals(attemptId) || !attempt.getJob().getId().equals(job.getId())
				|| !job.getActiveAttempt().getId().equals(attempt.getId())) {
			throw new IllegalArgumentException("Generation result correlation mismatch");
		}
	}
}
