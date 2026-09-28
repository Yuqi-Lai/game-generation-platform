package com.gamegeneration.platform.auth;

import java.util.ArrayList;
import java.nio.charset.StandardCharsets;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoders;
import org.springframework.security.oauth2.jwt.JwtIssuerValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
@EnableConfigurationProperties(AuthProperties.class)
public class SecurityConfig {
	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		return http
				.cors(Customizer.withDefaults())
				.csrf(csrf -> csrf.disable())
				.authorizeHttpRequests(requests -> requests
						.requestMatchers("/actuator/health/**", "/actuator/info").permitAll()
						.anyRequest().authenticated())
				.oauth2ResourceServer(resourceServer -> resourceServer.jwt(Customizer.withDefaults()))
				.build();
	}

	@Bean
	JwtDecoder jwtDecoder(
			@Value("${spring.security.oauth2.resourceserver.jwt.issuer-uri}") String issuer,
			@Value("${spring.security.oauth2.resourceserver.jwt.jwk-set-uri}") String jwkSetUri,
			@Value("${app.load-test.auth-enabled:false}") boolean loadTestAuthEnabled,
			@Value("${app.load-test.auth-secret:}") String loadTestAuthSecret,
			AuthProperties properties) {
		NimbusJwtDecoder decoder;
		if (loadTestAuthEnabled) {
			if (loadTestAuthSecret.length() < 32) {
				throw new IllegalStateException("Load-test JWT secret must contain at least 32 characters");
			}
			var key = new SecretKeySpec(loadTestAuthSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
			decoder = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
		} else {
			decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();
		}
		OAuth2TokenValidator<Jwt> issuerValidator = new JwtIssuerValidator(issuer);
		OAuth2TokenValidator<Jwt> audienceValidator = new JwtClaimValidator<>("aud",
				audiences -> audiences instanceof java.util.Collection<?> values
						&& values.contains(properties.auth().audience()));
		decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(issuerValidator, audienceValidator));
		return decoder;
	}

	@Bean
	CorsConfigurationSource corsConfigurationSource(AuthProperties properties) {
		var configuration = new CorsConfiguration();
		configuration.setAllowedOrigins(properties.cors().allowedOrigins());
		configuration.setAllowedMethods(new ArrayList<>(java.util.List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")));
		configuration.setAllowedHeaders(java.util.List.of("Authorization", "Content-Type", "If-Match"));
		configuration.setExposedHeaders(java.util.List.of("ETag"));
		configuration.setAllowCredentials(true);
		var source = new UrlBasedCorsConfigurationSource();
		source.registerCorsConfiguration("/**", configuration);
		return source;
	}
}
