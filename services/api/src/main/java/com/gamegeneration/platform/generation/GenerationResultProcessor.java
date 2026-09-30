package com.gamegeneration.platform.generation;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.gamegeneration.platform.content.ContentAsset;
import com.gamegeneration.platform.content.ContentAssetRepository;
import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.content.ContentVersionRepository;
import com.gamegeneration.platform.credit.CreditService;
import com.gamegeneration.platform.inbox.InboxEvent;
import com.gamegeneration.platform.inbox.InboxEventRepository;
import com.gamegeneration.platform.outbox.OutboxEvent;
import com.gamegeneration.platform.outbox.OutboxEventRepository;
import com.gamegeneration.platform.project.ProjectRepository;
import com.gamegeneration.platform.review.ContentReviewService;
import com.gamegeneration.platform.realtime.RealtimeEvent;
import com.gamegeneration.platform.realtime.RealtimeEventTypes;
import com.gamegeneration.platform.realtime.RealtimeNotifier;
import java.time.Instant;
import java.util.Map;
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
	private final OutboxEventRepository outbox;
	private final GenerationProperties properties;
	private final GenerationService generationService;
	private final ContentReviewService contentReviews;
	private final CreditService credits;
	private final RealtimeNotifier realtime;

	public GenerationResultProcessor(ObjectMapper objectMapper, InboxEventRepository inbox,
			GenerationJobRepository jobs, GenerationAttemptRepository attempts,
			ProjectRepository projects, ContentVersionRepository versions,
			ContentAssetRepository assets, OutboxEventRepository outbox,
			GenerationProperties properties, GenerationService generationService,
			ContentReviewService contentReviews, CreditService credits, RealtimeNotifier realtime) {
		this.objectMapper = objectMapper;
		this.inbox = inbox;
		this.jobs = jobs;
		this.attempts = attempts;
		this.projects = projects;
		this.versions = versions;
		this.assets = assets;
		this.outbox = outbox;
		this.properties = properties;
		this.generationService = generationService;
		this.contentReviews = contentReviews;
		this.credits = credits;
		this.realtime = realtime;
	}

	@Transactional
	public void process(String payload) throws Exception {
		JsonNode tree = objectMapper.readTree(payload);
		UUID eventId = UUID.fromString(tree.required("eventId").asText());
		String eventType = tree.required("eventType").asText();
		var duplicate = inbox.findForUpdate(eventId);
		if (duplicate.isPresent()) {
			duplicate.get().duplicateReceived();
			return;
		}
		switch (eventType) {
			case GenerationEvents.STARTED -> started(eventId, objectMapper.treeToValue(tree, GenerationEvents.Started.class));
			case GenerationEvents.SUCCEEDED -> succeed(eventId, objectMapper.treeToValue(tree, GenerationEvents.Succeeded.class));
			case GenerationEvents.FAILED -> fail(eventId, objectMapper.treeToValue(tree, GenerationEvents.Failed.class));
			default -> throw new IllegalArgumentException("Unsupported generation result event: " + eventType);
		}
	}

	private void started(UUID eventId, GenerationEvents.Started event) {
		var context = context(eventId, event.eventType(), event.jobId(), event.attemptId(), event.executionKey());
		if (context == null) return;
		var job = context.job();
		var attempt = context.attempt();
		if (recordIfInactiveOrTerminal(eventId, event.eventType(), job, attempt)) return;
		if (job.getStatus() == GenerationJobStatus.CANCEL_REQUESTED) {
			attempt.cancel();
			job.cancel();
			credits.release(job);
			record(eventId, event.eventType(), job, attempt, "CANCELLED", "Worker started after cancellation request");
			generationService.notifyJob(job);
			return;
		}
		attempt.start(event.workerExecutionId());
		if (job.getStatus() == GenerationJobStatus.QUEUED) job.markRunning();
		record(eventId, event.eventType(), job, attempt, "ACCEPTED", null);
		generationService.notifyJob(job);
	}

	private void succeed(UUID eventId, GenerationEvents.Succeeded event) {
		var context = context(eventId, event.eventType(), event.jobId(), event.attemptId(), event.executionKey());
		if (context == null) return;
		var job = context.job();
		var attempt = context.attempt();
		if (recordIfInactiveOrTerminal(eventId, event.eventType(), job, attempt)) return;
		if (job.getStatus() == GenerationJobStatus.CANCEL_REQUESTED) {
			attempt.cancel();
			job.cancel();
			credits.release(job);
			record(eventId, event.eventType(), job, attempt, "CANCELLED_LATE_RESULT",
					"Success ignored because cancellation was requested");
			generationService.notifyJob(job);
			return;
		}
		if (job.getStatus() == GenerationJobStatus.QUEUED) job.markRunning();
		var version = versions.findBySourceGenerationJobId(job.getId()).orElseGet(() -> {
			var project = projects.findForUpdate(job.getProject().getId())
					.orElseThrow(() -> new IllegalArgumentException("Project no longer exists"));
			contentReviews.supersedeOpenReviews(project.getId());
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
		attempt.succeed(event.model(), event.workerExecutionId());
		job.succeed(version);
		credits.capture(job);
		record(eventId, event.eventType(), job, attempt, "ACCEPTED", null);
		generationService.notifyJob(job);
		realtime.afterCommit(RealtimeEvent.now(RealtimeEventTypes.CONTENT_VERSION_UPDATED,
				job.getProject().getId(), version.getId(), Map.of(
						"status", version.getStatus().name(),
						"versionNumber", version.getVersionNumber())));
	}

	private void fail(UUID eventId, GenerationEvents.Failed event) {
		var context = context(eventId, event.eventType(), event.jobId(), event.attemptId(), event.executionKey());
		if (context == null) return;
		var job = context.job();
		var attempt = context.attempt();
		if (recordIfInactiveOrTerminal(eventId, event.eventType(), job, attempt)) return;
		attempt.fail(event.model(), event.workerExecutionId(), event.failureCode(), event.failureMessage(), event.retryable());
		if (job.getStatus() == GenerationJobStatus.CANCEL_REQUESTED) {
			job.cancel();
			credits.release(job);
			record(eventId, event.eventType(), job, attempt, "CANCELLED", "Failure received after cancellation request");
			generationService.notifyJob(job);
			return;
		}
		if (event.retryable() && attempt.getAttemptNumber() < properties.maxAttempts()) {
			var next = attempts.saveAndFlush(new GenerationAttempt(job, attempt.getAttemptNumber() + 1, event.provider()));
			job.requeue(next);
			generationService.enqueueAttempt(job, next, properties.retryTopic());
			record(eventId, event.eventType(), job, attempt, "RETRY_SCHEDULED", "Scheduled attempt " + next.getAttemptNumber());
			generationService.notifyJob(job);
			return;
		}
		if (job.getStatus() == GenerationJobStatus.QUEUED) job.markRunning();
		job.fail(event.failureCode(), event.failureMessage());
		credits.release(job);
		if (event.retryable()) publishDeadLetter(job, attempt, event);
		record(eventId, event.eventType(), job, attempt,
				event.retryable() ? "RETRIES_EXHAUSTED" : "NON_RETRYABLE_FAILURE", null);
		generationService.notifyJob(job);
	}

	private ProcessingContext context(UUID eventId, String eventType, UUID jobId, UUID attemptId, UUID executionKey) {
		var job = jobs.findForUpdate(jobId).orElse(null);
		var attempt = attempts.findByExecutionKeyForUpdate(executionKey).orElse(null);
		if (attempt == null || job == null || !attempt.getId().equals(attemptId)
				|| !attempt.getJob().getId().equals(jobId)) {
			record(eventId, eventType, job, attempt, "CORRELATION_REJECTED",
					"Unknown or mismatched job, attempt, or execution key");
			return null;
		}
		return new ProcessingContext(job, attempt);
	}

	private boolean recordIfInactiveOrTerminal(UUID eventId, String eventType,
			GenerationJob job, GenerationAttempt attempt) {
		if (job.getStatus().isTerminal()) {
			record(eventId, eventType, job, attempt, "LATE_TERMINAL_RESULT",
					"Result ignored because job is " + job.getStatus());
			return true;
		}
		if (job.getActiveAttempt() == null || !job.getActiveAttempt().getId().equals(attempt.getId())) {
			record(eventId, eventType, job, attempt, "STALE_ATTEMPT_RESULT",
					"Result ignored because a newer attempt is active");
			return true;
		}
		return false;
	}

	private void publishDeadLetter(GenerationJob job, GenerationAttempt attempt, GenerationEvents.Failed failure) {
		UUID eventId = UUID.randomUUID();
		var event = new GenerationEvents.DeadLettered(eventId, GenerationEvents.DEAD_LETTERED, 1, Instant.now(),
				job.getId(), attempt.getId(), attempt.getExecutionKey(), attempt.getAttemptNumber(),
				failure.failureCode(), failure.failureMessage());
		outbox.save(new OutboxEvent(eventId, "GenerationJob", job.getId(), GenerationEvents.DEAD_LETTERED,
				properties.dlqTopic(), job.getId().toString(), objectMapper.writeValueAsString(event)));
	}

	private void record(UUID eventId, String eventType, GenerationJob job,
			GenerationAttempt attempt, String disposition, String detail) {
		inbox.save(new InboxEvent(eventId, eventType, job == null ? null : job.getId(),
				attempt == null ? null : attempt.getId(), disposition, detail));
	}

	private record ProcessingContext(GenerationJob job, GenerationAttempt attempt) {}
}
