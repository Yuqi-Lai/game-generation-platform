package com.gamegeneration.platform.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gamegeneration.platform.auth.AccessInvitation;
import com.gamegeneration.platform.auth.AccessInvitationRepository;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.generation.GenerationApi;
import com.gamegeneration.platform.generation.GenerationEvents;
import com.gamegeneration.platform.generation.GenerationJobRepository;
import com.gamegeneration.platform.generation.GenerationLifecycleService;
import com.gamegeneration.platform.generation.GenerationResultProcessor;
import com.gamegeneration.platform.generation.GenerationService;
import com.gamegeneration.platform.project.ProjectRepository;
import com.gamegeneration.platform.pack.ContentPackApi;
import com.gamegeneration.platform.pack.ContentPackExportResultProcessor;
import com.gamegeneration.platform.pack.ContentPackEvents;
import com.gamegeneration.platform.pack.ContentPackItemRepository;
import com.gamegeneration.platform.pack.ContentPackRepository;
import com.gamegeneration.platform.pack.ContentPackService;
import com.gamegeneration.platform.pack.ExportInboxEventRepository;
import com.gamegeneration.platform.pack.ExportJobRepository;
import com.gamegeneration.platform.project.ProjectApi;
import com.gamegeneration.platform.project.ProjectService;
import com.gamegeneration.platform.project.ProjectRole;
import com.gamegeneration.platform.review.ContentReviewApi;
import com.gamegeneration.platform.review.ContentReviewService;
import com.gamegeneration.platform.review.ReviewDecisionRepository;
import com.gamegeneration.platform.review.ReviewDecisionType;
import com.gamegeneration.platform.review.ReviewRequestRepository;
import com.gamegeneration.platform.shared.ConflictException;
import com.gamegeneration.platform.shared.ForbiddenException;
import com.gamegeneration.platform.user.AppUser;
import com.gamegeneration.platform.user.AppUserRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest(properties = {
		"app.auth.bootstrap-invited-emails=",
		"spring.kafka.listener.auto-startup=false",
		"spring.kafka.admin.auto-create=false",
		"spring.task.scheduling.enabled=false",
		"app.generation.outbox-publish-delay-ms=3600000"
})
@AutoConfigureMockMvc
@Testcontainers
class PostgresIntegrationTest {
	@Container
	@ServiceConnection
	static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine");

	@Autowired JdbcTemplate jdbc;
	@Autowired MockMvc mockMvc;
	@Autowired AccessInvitationRepository invitations;
	@Autowired AppUserRepository users;
	@Autowired ProjectRepository projects;
	@Autowired ProjectMembershipRepository memberships;
	@Autowired ProjectService projectService;
	@Autowired GenerationService generationService;
	@Autowired GenerationResultProcessor resultProcessor;
	@Autowired GenerationJobRepository generationJobs;
	@Autowired GenerationLifecycleService generationLifecycle;
	@Autowired ContentReviewService contentReviews;
	@Autowired ReviewRequestRepository reviewRequests;
	@Autowired ReviewDecisionRepository reviewDecisions;
	@Autowired ContentPackService contentPacks;
	@Autowired ContentPackRepository packRepository;
	@Autowired ContentPackItemRepository packItems;
	@Autowired ExportJobRepository exportJobs;
	@Autowired ExportInboxEventRepository exportInbox;
	@Autowired ContentPackExportResultProcessor exportResults;
	@Autowired tools.jackson.databind.ObjectMapper objectMapper;

	@Test
	void flywayCreatesThePlatformTables() {
		var tables = jdbc.queryForList(
				"select table_name from information_schema.tables where table_schema = 'public'",
				String.class);
		assertThat(tables).contains("app_user", "access_invitation", "project", "project_membership",
				"generation_job", "generation_attempt", "outbox_event", "inbox_event",
				"content_version", "content_asset", "review_request", "review_assignment", "review_decision",
				"content_pack", "content_pack_item", "export_job", "export_inbox_event");
	}

	@Test
	@Transactional
	void mockJwtConsumesInvitationAndCreatesUser() throws Exception {
		invitations.saveAndFlush(new AccessInvitation("invited@example.test", "integration test"));

		mockMvc.perform(get("/api/v1/me").with(jwt().jwt(token -> token
				.issuer("https://auth.invalid/")
				.subject("github|integration")
				.claim("aud", java.util.List.of("https://api.game-generation.local"))
				.claim("email", "Invited@Example.Test")
				.claim("email_verified", true)
				.claim("name", "Invited User"))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.email").value("Invited@Example.Test"));

		assertThat(users.findByAuthIssuerAndAuthSubject(
				"https://auth.invalid/", "github|integration")).isPresent();
	}

	@Test
	@Transactional
	void generationResultCreatesOneDraftVersionIdempotently() throws Exception {
		var actor = users.saveAndFlush(new AppUser("https://auth.invalid/", "github|generator",
				"generator@example.test", true, "Generator"));
		var project = projectService.create(actor,
				new ProjectApi.CreateProjectRequest("Synthetic Generation", null));
		var jobResponse = generationService.create(actor, project.id(),
				new GenerationApi.CreateGenerationRequest(UUID.randomUUID(), "Create an original forest puzzle."));
		var job = generationJobs.findById(jobResponse.id()).orElseThrow();
		var attempt = job.getActiveAttempt();
		var event = new GenerationEvents.Succeeded(UUID.randomUUID(), GenerationEvents.SUCCEEDED, 1,
				Instant.now(), job.getId(), attempt.getId(), attempt.getExecutionKey(), "GEMINI",
				"test-model", "worker-1", "Synthetic Forest", objectMapper.readTree("{\"synopsis\":\"Safe fixture\"}"),
				List.of(new GenerationEvents.Asset("CONTENT_JSON", "test-bucket", "safe/content.json",
						"application/json", 24, "a".repeat(64), objectMapper.createObjectNode())));
		String payload = objectMapper.writeValueAsString(event);

		resultProcessor.process(payload);
		resultProcessor.process(payload);

		var completed = generationService.get(actor, project.id(), job.getId());
		assertThat(completed.status()).isEqualTo("SUCCEEDED");
		assertThat(completed.contentVersion().status()).isEqualTo("DRAFT");
		assertThat(completed.contentVersion().versionNumber()).isEqualTo(1);
		assertThat(completed.contentVersion().assets()).hasSize(1);
		assertThat(jdbc.queryForObject("select count(*) from content_version where source_generation_job_id = ?",
				Integer.class, job.getId())).isEqualTo(1);
	}

	@Test
	@Transactional
	void duplicateGenerationRequestReturnsTheOriginalJob() {
		var fixture = fixture("duplicate-request");
		UUID requestId = UUID.randomUUID();
		var first = generationService.create(fixture.actor(), fixture.projectId(),
				new GenerationApi.CreateGenerationRequest(requestId, "Synthetic request"));
		var second = generationService.create(fixture.actor(), fixture.projectId(),
				new GenerationApi.CreateGenerationRequest(requestId, "Synthetic request"));

		assertThat(second.id()).isEqualTo(first.id());
	}

	@Test
	@Transactional
	void retryableFailureCreatesTheNextAttemptOnTheRetryTopic() throws Exception {
		var fixture = jobFixture("retryable");
		resultProcessor.process(failure(fixture.job(), true, "PROVIDER_RATE_LIMITED"));

		var response = generationService.get(fixture.actor(), fixture.projectId(), fixture.job().getId());
		assertThat(response.status()).isEqualTo("QUEUED");
		assertThat(response.attemptNumber()).isEqualTo(2);
		generationJobs.flush();
		assertThat(jdbc.queryForObject(
				"select count(*) from outbox_event where topic = 'generation.execution.retry.v1'",
				Integer.class)).isEqualTo(1);
	}

	@Test
	@Transactional
	void nonRetryableFailureFailsWithoutCreatingAnotherAttempt() throws Exception {
		var fixture = jobFixture("permanent");
		resultProcessor.process(failure(fixture.job(), false, "PROVIDER_INVALID_REQUEST"));

		var response = generationService.get(fixture.actor(), fixture.projectId(), fixture.job().getId());
		assertThat(response.status()).isEqualTo("FAILED");
		assertThat(response.attemptNumber()).isEqualTo(1);
	}

	@Test
	@Transactional
	void exhaustedRetriesFailAndPublishOneDeadLetter() throws Exception {
		var fixture = jobFixture("exhausted");
		for (int attemptNumber = 1; attemptNumber <= 3; attemptNumber++) {
			resultProcessor.process(failure(fixture.job(), true, "PROVIDER_SERVER_ERROR"));
		}

		var response = generationService.get(fixture.actor(), fixture.projectId(), fixture.job().getId());
		assertThat(response.status()).isEqualTo("FAILED");
		assertThat(response.attemptNumber()).isEqualTo(3);
		generationJobs.flush();
		assertThat(jdbc.queryForObject(
				"select count(*) from outbox_event where topic = 'generation.execution.dlq.v1'",
				Integer.class)).isEqualTo(1);
	}

	@Test
	@Transactional
	void timeoutIsExactAndLateSuccessCannotCreateContent() throws Exception {
		var fixture = jobFixture("timeout");
		generationLifecycle.timeOutIfStale(fixture.job().getId(), Instant.now().plusSeconds(1));
		generationLifecycle.timeOutIfStale(fixture.job().getId(), Instant.now().plusSeconds(1));
		resultProcessor.process(success(fixture.job(), UUID.randomUUID()));

		var response = generationService.get(fixture.actor(), fixture.projectId(), fixture.job().getId());
		assertThat(response.status()).isEqualTo("TIMED_OUT");
		assertThat(response.contentVersion()).isNull();
		generationJobs.flush();
		assertThat(jdbc.queryForObject(
				"select disposition from inbox_event where job_id = ? order by processed_at desc limit 1",
				String.class, fixture.job().getId())).isEqualTo("LATE_TERMINAL_RESULT");
	}

	@Test
	@Transactional
	void cancellationIsIdempotentAndWinsAgainstWorkerSuccess() throws Exception {
		var fixture = jobFixture("cancel-race");
		var first = generationService.cancel(fixture.actor(), fixture.projectId(), fixture.job().getId());
		var second = generationService.cancel(fixture.actor(), fixture.projectId(), fixture.job().getId());
		resultProcessor.process(success(fixture.job(), UUID.randomUUID()));

		assertThat(first.status()).isEqualTo("CANCEL_REQUESTED");
		assertThat(second.status()).isEqualTo("CANCEL_REQUESTED");
		var response = generationService.get(fixture.actor(), fixture.projectId(), fixture.job().getId());
		assertThat(response.status()).isEqualTo("CANCELLED");
		assertThat(response.contentVersion()).isNull();
	}

	@Test
	@Transactional
	void completedSuccessIsNotCorruptedByCancellation() throws Exception {
		var fixture = jobFixture("success-before-cancel");
		resultProcessor.process(success(fixture.job(), UUID.randomUUID()));

		var cancelled = generationService.cancel(
				fixture.actor(), fixture.projectId(), fixture.job().getId());

		assertThat(cancelled.status()).isEqualTo("SUCCEEDED");
		assertThat(cancelled.contentVersion()).isNotNull();
		assertThat(jdbc.queryForObject("select count(*) from content_version where source_generation_job_id = ?",
				Integer.class, fixture.job().getId())).isEqualTo(1);
	}

	@Test
	@Transactional
	void repeatedSubmitAndDuplicateDecisionAreIdempotent() throws Exception {
		var fixture = reviewFixture("review-idempotency", 1);
		UUID submitId = UUID.randomUUID();
		var first = contentReviews.submit(fixture.owner(), fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(submitId));
		var repeated = contentReviews.submit(fixture.owner(), fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(submitId));
		UUID decisionId = UUID.randomUUID();
		contentReviews.decide(fixture.reviewers().getFirst(), fixture.projectId(), fixture.versionId(),
				first.reviewRequest().id(), ReviewDecisionType.APPROVE,
				new ContentReviewApi.DecisionRequest(decisionId, "Ready to ship."));
		contentReviews.decide(fixture.reviewers().getFirst(), fixture.projectId(), fixture.versionId(),
				first.reviewRequest().id(), ReviewDecisionType.APPROVE,
				new ContentReviewApi.DecisionRequest(decisionId, "Ready to ship."));

		assertThat(repeated.reviewRequest().id()).isEqualTo(first.reviewRequest().id());
		assertThat(reviewRequests.countByContentVersionId(fixture.versionId())).isEqualTo(1);
		assertThat(reviewDecisions.countByReviewRequestId(first.reviewRequest().id())).isEqualTo(1);
		assertThat(contentReviews.getVersion(fixture.owner(), fixture.projectId(), fixture.versionId()).status())
				.isEqualTo("APPROVED");
	}

	@Test
	void concurrentApproveAndRequestChangesResolveWithoutCorruption() throws Exception {
		var fixture = reviewFixture("review-race", 2);
		var submitted = contentReviews.submit(fixture.owner(), fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(UUID.randomUUID()));
		var start = new CountDownLatch(1);
		try (var executor = Executors.newFixedThreadPool(2)) {
			var approve = executor.submit(() -> decideAfter(start, fixture.reviewers().get(0), fixture,
					submitted.reviewRequest().id(), ReviewDecisionType.APPROVE));
			var changes = executor.submit(() -> decideAfter(start, fixture.reviewers().get(1), fixture,
					submitted.reviewRequest().id(), ReviewDecisionType.REQUEST_CHANGES));
			start.countDown();
			assertThat(List.of(approve.get(), changes.get())).allMatch(result ->
					result.equals("accepted") || result.equals("closed"));
		}

		var version = contentReviews.getVersion(fixture.owner(), fixture.projectId(), fixture.versionId());
		assertThat(version.status()).isEqualTo("CHANGES_REQUESTED");
		assertThat(reviewDecisions.countByReviewRequestId(submitted.reviewRequest().id())).isBetween(1L, 2L);
	}

	@Test
	@Transactional
	void newerVersionSupersedesOpenReviewAndRejectsStaleApproval() throws Exception {
		var fixture = reviewFixture("review-superseded", 1);
		var submitted = contentReviews.submit(fixture.owner(), fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(UUID.randomUUID()));
		var newerVersionId = generateVersion(fixture.owner(), fixture.projectId(), "newer-draft");

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentReviews.decide(
				fixture.reviewers().getFirst(), fixture.projectId(), fixture.versionId(),
				submitted.reviewRequest().id(), ReviewDecisionType.APPROVE,
				new ContentReviewApi.DecisionRequest(UUID.randomUUID(), null)))
				.isInstanceOf(ConflictException.class);
		assertThat(contentReviews.getVersion(fixture.owner(), fixture.projectId(), fixture.versionId()).status())
				.isEqualTo("SUPERSEDED");
		assertThat(contentReviews.getVersion(fixture.owner(), fixture.projectId(), newerVersionId).status())
				.isEqualTo("DRAFT");
	}

	@Test
	@Transactional
	void approvedVersionRemainsApprovedWhenNewerVersionIsCreated() throws Exception {
		var fixture = reviewFixture("review-approved", 1);
		var submitted = contentReviews.submit(fixture.owner(), fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(UUID.randomUUID()));
		contentReviews.decide(fixture.reviewers().getFirst(), fixture.projectId(), fixture.versionId(),
				submitted.reviewRequest().id(), ReviewDecisionType.APPROVE,
				new ContentReviewApi.DecisionRequest(UUID.randomUUID(), "Approved."));
		var newerVersionId = generateVersion(fixture.owner(), fixture.projectId(), "approved-newer");

		assertThat(contentReviews.getVersion(fixture.owner(), fixture.projectId(), fixture.versionId()).status())
				.isEqualTo("APPROVED");
		assertThat(contentReviews.getVersion(fixture.owner(), fixture.projectId(), newerVersionId).status())
				.isEqualTo("DRAFT");
	}

	@Test
	@Transactional
	void projectRolesAuthorizeSubmitAndDecisions() throws Exception {
		var fixture = reviewFixture("review-roles", 1);
		var editor = newUser("editor");
		var viewer = newUser("viewer");
		projectService.putMember(fixture.owner(), fixture.projectId(), editor.getId(), ProjectRole.EDITOR);
		projectService.putMember(fixture.owner(), fixture.projectId(), viewer.getId(), ProjectRole.VIEWER);

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentReviews.submit(
				viewer, fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(UUID.randomUUID())))
				.isInstanceOf(ForbiddenException.class);
		var submitted = contentReviews.submit(editor, fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(UUID.randomUUID()));
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentReviews.decide(
				editor, fixture.projectId(), fixture.versionId(), submitted.reviewRequest().id(),
				ReviewDecisionType.APPROVE, new ContentReviewApi.DecisionRequest(UUID.randomUUID(), null)))
				.isInstanceOf(ForbiddenException.class);
	}

	@Test
	@Transactional
	void packRejectsCrossProjectAndNonApprovedVersionsAndDeduplicatesItems() throws Exception {
		var fixture = approvedVersionFixture("pack-validation");
		var pack = contentPacks.create(fixture.owner(), fixture.projectId(),
				new ContentPackApi.CreatePackRequest("Synthetic Pack"));
		var draft = generateVersion(fixture.owner(), fixture.projectId(), "pack-draft");
		var other = approvedVersionFixture("pack-other-project");

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentPacks.addItem(
				fixture.owner(), fixture.projectId(), pack.id(), new ContentPackApi.AddItemRequest(draft)))
				.isInstanceOf(ConflictException.class);
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentPacks.addItem(
				fixture.owner(), fixture.projectId(), pack.id(), new ContentPackApi.AddItemRequest(other.versionId())))
				.isInstanceOf(ConflictException.class);
		contentPacks.addItem(fixture.owner(), fixture.projectId(), pack.id(),
				new ContentPackApi.AddItemRequest(fixture.versionId()));
		contentPacks.addItem(fixture.owner(), fixture.projectId(), pack.id(),
				new ContentPackApi.AddItemRequest(fixture.versionId()));

		assertThat(packItems.countByContentPackId(pack.id())).isEqualTo(1);
	}

	@Test
	@Transactional
	void readyPackIsImmutableAndNewerVersionsDoNotChangeItsSnapshot() throws Exception {
		var fixture = approvedVersionFixture("pack-immutable");
		var pack = contentPacks.create(fixture.owner(), fixture.projectId(),
				new ContentPackApi.CreatePackRequest("Immutable Pack"));
		contentPacks.addItem(fixture.owner(), fixture.projectId(), pack.id(),
				new ContentPackApi.AddItemRequest(fixture.versionId()));
		contentPacks.ready(fixture.owner(), fixture.projectId(), pack.id());
		var newer = generateVersion(fixture.owner(), fixture.projectId(), "newer-pack-version");

		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentPacks.removeItem(
				fixture.owner(), fixture.projectId(), pack.id(), fixture.versionId()))
				.isInstanceOf(ConflictException.class);
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentPacks.addItem(
				fixture.owner(), fixture.projectId(), pack.id(), new ContentPackApi.AddItemRequest(newer)))
				.isInstanceOf(ConflictException.class);
		var persisted = contentPacks.get(fixture.owner(), fixture.projectId(), pack.id());
		assertThat(persisted.items()).extracting(ContentPackApi.ItemResponse::contentVersionId)
				.containsExactly(fixture.versionId());
	}

	@Test
	@Transactional
	void successfulExportAndDuplicateResultAreIdempotent() throws Exception {
		var fixture = readyPackFixture("pack-export-success");
		var exporting = contentPacks.startExport(fixture.owner(), fixture.projectId(), fixture.packId(),
				new ContentPackApi.StartExportRequest(UUID.randomUUID()));
		var job = exportJobs.findByContentPackId(fixture.packId()).orElseThrow();
		UUID eventId = UUID.randomUUID();
		var event = new ContentPackEvents.Succeeded(eventId, ContentPackEvents.SUCCEEDED, 1, Instant.now(),
				job.getId(), fixture.packId(), job.getExecutionKey(), "export-worker", "forge-generation-assets",
				job.getArtifactKey(), "application/zip", 512, "b".repeat(64));
		String payload = objectMapper.writeValueAsString(event);

		exportResults.process(payload);
		exportResults.process(payload);

		var completed = contentPacks.get(fixture.owner(), fixture.projectId(), fixture.packId());
		assertThat(exporting.status()).isEqualTo("EXPORTING");
		assertThat(completed.status()).isEqualTo("EXPORTED");
		assertThat(completed.exportJob().sha256()).isEqualTo("b".repeat(64));
		assertThat(completed.exportJob().artifactUri()).isEqualTo(
				"s3://forge-generation-assets/" + job.getArtifactKey());
		assertThat(exportInbox.countByExportJobId(job.getId())).isEqualTo(1);
		assertThat(packItems.countByContentPackId(fixture.packId())).isEqualTo(1);
	}

	@Test
	@Transactional
	void terminalExportFailureIsPersisted() throws Exception {
		var fixture = readyPackFixture("pack-export-failure");
		contentPacks.startExport(fixture.owner(), fixture.projectId(), fixture.packId(),
				new ContentPackApi.StartExportRequest(UUID.randomUUID()));
		var job = exportJobs.findByContentPackId(fixture.packId()).orElseThrow();
		var event = new ContentPackEvents.Failed(UUID.randomUUID(), ContentPackEvents.FAILED, 1, Instant.now(),
				job.getId(), fixture.packId(), job.getExecutionKey(), "export-worker",
				"PACK_EXPORT_FAILED", "Synthetic storage failure");

		exportResults.process(objectMapper.writeValueAsString(event));

		var failed = contentPacks.get(fixture.owner(), fixture.projectId(), fixture.packId());
		assertThat(failed.status()).isEqualTo("FAILED");
		assertThat(failed.exportJob().failureMessage()).isEqualTo("Synthetic storage failure");
	}

	@Test
	@Transactional
	void packAuthorizationIsEditorWriteAndReviewerViewerReadOnly() throws Exception {
		var fixture = approvedVersionFixture("pack-roles");
		var editor = newUser("pack-editor");
		var viewer = newUser("pack-viewer");
		projectService.putMember(fixture.owner(), fixture.projectId(), editor.getId(), ProjectRole.EDITOR);
		projectService.putMember(fixture.owner(), fixture.projectId(), viewer.getId(), ProjectRole.VIEWER);
		var pack = contentPacks.create(editor, fixture.projectId(), new ContentPackApi.CreatePackRequest("Editor Pack"));

		assertThat(contentPacks.get(viewer, fixture.projectId(), pack.id()).id()).isEqualTo(pack.id());
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentPacks.addItem(
				viewer, fixture.projectId(), pack.id(), new ContentPackApi.AddItemRequest(fixture.versionId())))
				.isInstanceOf(ForbiddenException.class);
		org.assertj.core.api.Assertions.assertThatThrownBy(() -> contentPacks.create(
				fixture.reviewers().getFirst(), fixture.projectId(), new ContentPackApi.CreatePackRequest("No")))
				.isInstanceOf(ForbiddenException.class);
	}

	private String failure(com.gamegeneration.platform.generation.GenerationJob job,
			boolean retryable, String code) {
		var attempt = job.getActiveAttempt();
		var event = new GenerationEvents.Failed(UUID.randomUUID(), GenerationEvents.FAILED, 1,
				Instant.now(), job.getId(), attempt.getId(), attempt.getExecutionKey(), "GEMINI",
				"test-model", "worker-" + attempt.getAttemptNumber(), code, "Synthetic failure", retryable);
		return objectMapper.writeValueAsString(event);
	}

	private String success(com.gamegeneration.platform.generation.GenerationJob job, UUID eventId) {
		var attempt = job.getActiveAttempt();
		var event = new GenerationEvents.Succeeded(eventId, GenerationEvents.SUCCEEDED, 1,
				Instant.now(), job.getId(), attempt.getId(), attempt.getExecutionKey(), "GEMINI",
				"test-model", "worker-success", "Synthetic Success",
				objectMapper.readTree("{\"synopsis\":\"Safe late fixture\"}"), List.of());
		return objectMapper.writeValueAsString(event);
	}

	private String decideAfter(CountDownLatch start, AppUser reviewer, ReviewFixture fixture,
			UUID reviewRequestId, ReviewDecisionType type) throws InterruptedException {
		start.await();
		try {
			contentReviews.decide(reviewer, fixture.projectId(), fixture.versionId(), reviewRequestId,
					type, new ContentReviewApi.DecisionRequest(UUID.randomUUID(), "Concurrent fixture"));
			return "accepted";
		} catch (ConflictException exception) {
			return "closed";
		}
	}

	private ReviewFixture reviewFixture(String suffix, int reviewerCount) throws Exception {
		var owner = newUser(suffix + "-owner");
		var project = projectService.create(owner,
				new ProjectApi.CreateProjectRequest("Synthetic " + suffix, null));
		var reviewers = new java.util.ArrayList<AppUser>();
		for (int index = 0; index < reviewerCount; index++) {
			var reviewer = newUser(suffix + "-reviewer-" + index);
			projectService.putMember(owner, project.id(), reviewer.getId(), ProjectRole.REVIEWER);
			reviewers.add(reviewer);
		}
		return new ReviewFixture(owner, reviewers, project.id(), generateVersion(owner, project.id(), suffix));
	}

	private UUID generateVersion(AppUser actor, UUID projectId, String suffix) throws Exception {
		var response = generationService.create(actor, projectId,
				new GenerationApi.CreateGenerationRequest(UUID.randomUUID(), "Synthetic " + suffix));
		var attempt = jdbc.queryForMap("select id, execution_key from generation_attempt where job_id = ?",
				response.id());
		var event = new GenerationEvents.Succeeded(UUID.randomUUID(), GenerationEvents.SUCCEEDED, 1,
				Instant.now(), response.id(), (UUID) attempt.get("id"), (UUID) attempt.get("execution_key"),
				"GEMINI", "test-model", "worker-success", "Synthetic Success",
				objectMapper.readTree("{\"synopsis\":\"Safe late fixture\"}"), List.of());
		resultProcessor.process(objectMapper.writeValueAsString(event));
		return generationService.get(actor, projectId, response.id()).contentVersion().id();
	}

	private AppUser newUser(String suffix) {
		return users.saveAndFlush(new AppUser("https://auth.invalid/", "github|" + suffix + UUID.randomUUID(),
				suffix + "@example.test", true, suffix));
	}

	private ApprovedVersionFixture approvedVersionFixture(String suffix) throws Exception {
		var fixture = reviewFixture(suffix, 1);
		var submitted = contentReviews.submit(fixture.owner(), fixture.projectId(), fixture.versionId(),
				new ContentReviewApi.SubmitReviewRequest(UUID.randomUUID()));
		contentReviews.decide(fixture.reviewers().getFirst(), fixture.projectId(), fixture.versionId(),
				submitted.reviewRequest().id(), ReviewDecisionType.APPROVE,
				new ContentReviewApi.DecisionRequest(UUID.randomUUID(), "Approved for pack fixture"));
		return new ApprovedVersionFixture(fixture.owner(), fixture.reviewers(), fixture.projectId(), fixture.versionId());
	}

	private ReadyPackFixture readyPackFixture(String suffix) throws Exception {
		var fixture = approvedVersionFixture(suffix);
		var pack = contentPacks.create(fixture.owner(), fixture.projectId(),
				new ContentPackApi.CreatePackRequest("Ready " + suffix));
		contentPacks.addItem(fixture.owner(), fixture.projectId(), pack.id(),
				new ContentPackApi.AddItemRequest(fixture.versionId()));
		contentPacks.ready(fixture.owner(), fixture.projectId(), pack.id());
		return new ReadyPackFixture(fixture.owner(), fixture.projectId(), pack.id());
	}

	private JobFixture jobFixture(String suffix) {
		var fixture = fixture(suffix);
		var response = generationService.create(fixture.actor(), fixture.projectId(),
				new GenerationApi.CreateGenerationRequest(UUID.randomUUID(), "Synthetic " + suffix));
		return new JobFixture(fixture.actor(), fixture.projectId(),
				generationJobs.findById(response.id()).orElseThrow());
	}

	private Fixture fixture(String suffix) {
		var actor = users.saveAndFlush(new AppUser("https://auth.invalid/", "github|" + suffix + UUID.randomUUID(),
				suffix + "@example.test", true, "Generator"));
		var project = projectService.create(actor,
				new ProjectApi.CreateProjectRequest("Synthetic " + suffix, null));
		return new Fixture(actor, project.id());
	}

	private record Fixture(AppUser actor, UUID projectId) {}
	private record JobFixture(AppUser actor, UUID projectId,
			com.gamegeneration.platform.generation.GenerationJob job) {}
	private record ReviewFixture(AppUser owner, List<AppUser> reviewers, UUID projectId, UUID versionId) {}
	private record ApprovedVersionFixture(AppUser owner, List<AppUser> reviewers,
			UUID projectId, UUID versionId) {}
	private record ReadyPackFixture(AppUser owner, UUID projectId, UUID packId) {}
}
