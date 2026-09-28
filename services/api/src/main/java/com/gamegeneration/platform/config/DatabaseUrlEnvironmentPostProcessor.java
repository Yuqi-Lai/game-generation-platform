package com.gamegeneration.platform.config;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/** Converts Render's PostgreSQL URI into the JDBC properties expected by Spring. */
public final class DatabaseUrlEnvironmentPostProcessor implements EnvironmentPostProcessor {
	private static final String PROPERTY_SOURCE = "renderDatabaseUrl";

	@Override
	public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
		String value = environment.getProperty("DATABASE_URL");
		if (value == null || value.isBlank() || value.startsWith("jdbc:")) {
			return;
		}

		URI uri = URI.create(value);
		if (!"postgres".equals(uri.getScheme()) && !"postgresql".equals(uri.getScheme())) {
			throw new IllegalArgumentException("DATABASE_URL must use the postgres or postgresql scheme");
		}
		if (uri.getHost() == null || uri.getPath() == null || uri.getPath().length() < 2) {
			throw new IllegalArgumentException("DATABASE_URL must include a host and database name");
		}

		String host = uri.getHost().contains(":") ? "[" + uri.getHost() + "]" : uri.getHost();
		String port = uri.getPort() < 0 ? "" : ":" + uri.getPort();
		String query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
		Map<String, Object> properties = new LinkedHashMap<>();
		properties.put("spring.datasource.url", "jdbc:postgresql://" + host + port + uri.getRawPath() + query);

		String userInfo = uri.getUserInfo();
		if (userInfo != null) {
			String[] credentials = userInfo.split(":", 2);
			properties.put("spring.datasource.username", credentials[0]);
			if (credentials.length == 2) properties.put("spring.datasource.password", credentials[1]);
		}

		environment.getPropertySources().addFirst(new MapPropertySource(PROPERTY_SOURCE, properties));
	}
}
