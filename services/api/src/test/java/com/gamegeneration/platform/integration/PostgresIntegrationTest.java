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
				new GenerationApi.CreateGenerationRequest("Create an original forest puzzle."));
		var job = generationJobs.findById(jobResponse.id()).orElseThrow();
		var attempt = job.getActiveAttempt();
		var event = new GenerationEvents.Succeeded(UUID.randomUUID(), GenerationEvents.SUCCEEDED, 1,
				Instant.now(), job.getId(), attempt.getId(), attempt.getExecutionKey(), "GEMINI",
				"test-model", "Synthetic Forest", objectMapper.readTree("{\"synopsis\":\"Safe fixture\"}"),
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
	}
}
