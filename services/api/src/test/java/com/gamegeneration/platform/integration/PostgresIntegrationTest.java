package com.gamegeneration.platform.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.gamegeneration.platform.auth.AccessInvitation;
import com.gamegeneration.platform.auth.AccessInvitationRepository;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.project.ProjectRepository;
import com.gamegeneration.platform.user.AppUserRepository;
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

@SpringBootTest(properties = "app.auth.bootstrap-invited-emails=")
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

	@Test
	void flywayCreatesThePhaseOneTables() {
		var tables = jdbc.queryForList(
				"select table_name from information_schema.tables where table_schema = 'public'",
				String.class);
		assertThat(tables).contains("app_user", "access_invitation", "project", "project_membership");
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
}
