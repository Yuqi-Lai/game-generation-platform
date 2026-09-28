package com.gamegeneration.platform.config;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.mock.env.MockEnvironment;

class DatabaseUrlEnvironmentPostProcessorTest {
	private final DatabaseUrlEnvironmentPostProcessor processor = new DatabaseUrlEnvironmentPostProcessor();

	@Test
	void convertsRenderConnectionStringWithoutLoggingCredentials() {
		var environment = new MockEnvironment()
				.withProperty("DATABASE_URL", "postgresql://" +
						"render_user:p%40ss@db.internal:5432/forge?sslmode=require");

		processor.postProcessEnvironment(environment, new SpringApplication());

		assertThat(environment.getProperty("spring.datasource.url"))
				.isEqualTo("jdbc:postgresql://db.internal:5432/forge?sslmode=require");
		assertThat(environment.getProperty("spring.datasource.username")).isEqualTo("render_user");
		assertThat(environment.getProperty("spring.datasource.password")).isEqualTo("p@ss");
	}

	@Test
	void leavesJdbcUrlsUnchanged() {
		var environment = new MockEnvironment()
				.withProperty("DATABASE_URL", "jdbc:postgresql://localhost:5432/forge");

		processor.postProcessEnvironment(environment, new SpringApplication());

		assertThat(environment.getProperty("spring.datasource.url")).isNull();
	}
}
