package com.gamegeneration.platform.credit;

import com.gamegeneration.platform.auth.AuthenticatedUserService;
import java.util.UUID;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/projects/{projectId}/credits")
public class CreditController {
	private final AuthenticatedUserService authenticatedUsers;
	private final CreditService credits;

	public CreditController(AuthenticatedUserService authenticatedUsers, CreditService credits) {
		this.authenticatedUsers = authenticatedUsers;
		this.credits = credits;
	}

	@GetMapping
	public CreditApi.BalanceResponse balance(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		return credits.balance(authenticatedUsers.resolve(jwt), projectId);
	}

	@GetMapping("/ledger")
	public CreditApi.LedgerResponse ledger(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID projectId) {
		return credits.recentLedger(authenticatedUsers.resolve(jwt), projectId);
	}
}
