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
import com.gamegeneration.platform.project.ProjectApi;
import com.gamegeneration.platform.project.ProjectService;
import com.gamegeneration.platform.user.AppUser;
import com.gamegeneration.platform.user.AppUserRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
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
	@Autowired tools.jackson.databind.ObjectMapper objectMapper;

	@Test
	void flywayCreatesThePlatformTables() {
		var tables = jdbc.queryForList(
				"select table_name from information_schema.tables where table_schema = 'public'",
				String.class);
		assertThat(tables).contains("app_user", "access_invitation", "project", "project_membership",
				"generation_job", "generation_attempt", "outbox_event", "inbox_event",
				"content_version", "content_asset");
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
}
