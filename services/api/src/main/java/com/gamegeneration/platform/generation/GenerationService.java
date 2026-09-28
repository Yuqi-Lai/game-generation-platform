package com.gamegeneration.platform.generation;

import tools.jackson.databind.ObjectMapper;
import com.gamegeneration.platform.content.ContentAssetRepository;
import com.gamegeneration.platform.credit.CreditProperties;
import com.gamegeneration.platform.credit.CreditService;
import com.gamegeneration.platform.membership.ProjectMembershipId;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.outbox.OutboxEvent;
import com.gamegeneration.platform.outbox.OutboxEventRepository;
import com.gamegeneration.platform.project.ProjectRepository;
import com.gamegeneration.platform.project.ProjectRole;
import com.gamegeneration.platform.project.ProjectStatus;
import com.gamegeneration.platform.shared.ConflictException;
import com.gamegeneration.platform.shared.ForbiddenException;
import com.gamegeneration.platform.shared.NotFoundException;
import com.gamegeneration.platform.user.AppUser;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GenerationService {
	private final ProjectRepository projects;
	private final ProjectMembershipRepository memberships;
	private final GenerationJobRepository jobs;
	private final GenerationAttemptRepository attempts;
	private final ContentAssetRepository assets;
	private final OutboxEventRepository outbox;
	private final GenerationProperties properties;
	private final CreditProperties creditProperties;
	private final CreditService credits;
	private final ObjectMapper objectMapper;

	public GenerationService(ProjectRepository projects, ProjectMembershipRepository memberships,
			GenerationJobRepository jobs, GenerationAttemptRepository attempts,
			ContentAssetRepository assets, OutboxEventRepository outbox,
			GenerationProperties properties, CreditProperties creditProperties,
			CreditService credits, ObjectMapper objectMapper) {
		this.projects = projects;
		this.memberships = memberships;
		this.jobs = jobs;
		this.attempts = attempts;
		this.assets = assets;
		this.outbox = outbox;
		this.properties = properties;
		this.creditProperties = creditProperties;
		this.credits = credits;
		this.objectMapper = objectMapper;
	}

	@Transactional
	public GenerationApi.GenerationJobResponse create(AppUser actor, UUID projectId,
			GenerationApi.CreateGenerationRequest request) {
		requireEditor(actor, projectId);
		var existing = jobs.findByProjectIdAndRequestedByIdAndRequestIdempotencyKey(
				projectId, actor.getId(), request.requestId());
		if (existing.isPresent()) return response(existing.get());
		var project = projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		existing = jobs.findByProjectIdAndRequestedByIdAndRequestIdempotencyKey(
				projectId, actor.getId(), request.requestId());
		if (existing.isPresent()) return response(existing.get());
		if (project.getStatus() != ProjectStatus.ACTIVE) {
			throw new ConflictException("Archived projects cannot generate content");
		}
		return createJob(project, actor, request.prompt().trim(), request.requestId(), null);
	}

	@Transactional
	public GenerationApi.GenerationJobResponse retry(AppUser actor, UUID projectId, UUID jobId,
			GenerationApi.RetryGenerationRequest request) {
		requireEditor(actor, projectId);
		var existing = jobs.findByProjectIdAndRequestedByIdAndRequestIdempotencyKey(
				projectId, actor.getId(), request.requestId());
		if (existing.isPresent()) return response(existing.get());
		var source = jobs.findForUpdate(jobId).orElseThrow(() -> new NotFoundException("Generation job not found"));
		if (!source.getProject().getId().equals(projectId)) throw new NotFoundException("Generation job not found");
		if (source.getStatus() != GenerationJobStatus.FAILED && source.getStatus() != GenerationJobStatus.TIMED_OUT) {
			throw new ConflictException("Only failed or timed-out jobs can be retried");
		}
		var project = projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		existing = jobs.findByProjectIdAndRequestedByIdAndRequestIdempotencyKey(
				projectId, actor.getId(), request.requestId());
		if (existing.isPresent()) return response(existing.get());
		if (project.getStatus() != ProjectStatus.ACTIVE) {
			throw new ConflictException("Archived projects cannot generate content");
		}
		return createJob(project, actor, source.getRequestPrompt(), request.requestId(), source);
	}

	@Transactional
	public GenerationApi.GenerationJobResponse cancel(AppUser actor, UUID projectId, UUID jobId) {
		requireEditor(actor, projectId);
		var job = jobs.findForUpdate(jobId).orElseThrow(() -> new NotFoundException("Generation job not found"));
		if (!job.getProject().getId().equals(projectId)) throw new NotFoundException("Generation job not found");
		job.requestCancellation();
		return response(job);
	}

	private GenerationApi.GenerationJobResponse createJob(com.gamegeneration.platform.project.Project project,
			AppUser actor, String prompt, UUID requestId, GenerationJob retryOf) {
		var job = jobs.saveAndFlush(new GenerationJob(project, actor, prompt, requestId, retryOf,
				creditProperties.generationCost()));
		credits.reserve(job);
		var attempt = attempts.saveAndFlush(new GenerationAttempt(job, 1, "GEMINI"));
		job.activate(attempt);
		enqueueAttempt(job, attempt, properties.requestTopic());
		return response(job);
	}

	void enqueueAttempt(GenerationJob job, GenerationAttempt attempt, String topic) {
		UUID eventId = UUID.randomUUID();
		var event = new GenerationEvents.Requested(eventId, GenerationEvents.REQUESTED, 1, Instant.now(),
				job.getId(), attempt.getId(), attempt.getExecutionKey(), job.getProject().getId(),
				attempt.getAttemptNumber(), job.getRequestPrompt(),
				"projects/%s/generation-jobs/%s/attempts/%s".formatted(
						job.getProject().getId(), job.getId(), attempt.getId()));
		outbox.save(new OutboxEvent(eventId, "GenerationJob", job.getId(), GenerationEvents.REQUESTED,
				topic, job.getId().toString(), objectMapper.writeValueAsString(event)));
	}

	@Transactional(readOnly = true)
	public GenerationApi.GenerationJobResponse get(AppUser actor, UUID projectId, UUID jobId) {
		requireMember(actor, projectId);
		var job = jobs.findById(jobId).orElseThrow(() -> new NotFoundException("Generation job not found"));
		if (!job.getProject().getId().equals(projectId)) throw new NotFoundException("Generation job not found");
		return response(job);
	}

	private void requireMember(AppUser actor, UUID projectId) {
		if (!memberships.existsById(new ProjectMembershipId(projectId, actor.getId()))) {
			throw new NotFoundException("Project not found");
		}
	}

	private void requireEditor(AppUser actor, UUID projectId) {
		var membership = memberships.findById(new ProjectMembershipId(projectId, actor.getId()))
				.orElseThrow(() -> new NotFoundException("Project not found"));
		if (membership.getRole() != ProjectRole.OWNER && membership.getRole() != ProjectRole.EDITOR) {
			throw new ForbiddenException("Editor access is required to manage generation jobs");
		}
	}

	GenerationApi.GenerationJobResponse response(GenerationJob job) {
		GenerationApi.ContentVersionResponse versionResponse = null;
		if (job.getResultContentVersion() != null) {
			var version = job.getResultContentVersion();
			versionResponse = GenerationApi.ContentVersionResponse.from(version,
					assets.findAllByContentVersionIdOrderByCreatedAtAsc(version.getId()), objectMapper);
		}
		return new GenerationApi.GenerationJobResponse(job.getId(), job.getProject().getId(),
				job.getRequestPrompt(), job.getStatus().name(), job.getFailureCode(), job.getFailureMessage(),
				job.getCreatedAt(), job.getUpdatedAt(), job.getCompletedAt(),
				job.getActiveAttempt() == null ? 0 : job.getActiveAttempt().getAttemptNumber(),
				!job.getStatus().isTerminal() && job.getStatus() != GenerationJobStatus.CANCEL_REQUESTED,
				job.getStatus() == GenerationJobStatus.FAILED || job.getStatus() == GenerationJobStatus.TIMED_OUT,
				versionResponse);
	}
}
