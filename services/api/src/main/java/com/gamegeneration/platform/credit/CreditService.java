package com.gamegeneration.platform.credit;

import com.gamegeneration.platform.generation.GenerationJob;
import com.gamegeneration.platform.membership.ProjectMembershipId;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.project.Project;
import com.gamegeneration.platform.realtime.RealtimeEvent;
import com.gamegeneration.platform.realtime.RealtimeEventTypes;
import com.gamegeneration.platform.realtime.RealtimeNotifier;
import com.gamegeneration.platform.shared.NotFoundException;
import com.gamegeneration.platform.user.AppUser;
import java.util.UUID;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CreditService {
	private final ProjectCreditAccountRepository accounts;
	private final CreditLedgerRepository ledger;
	private final ProjectMembershipRepository memberships;
	private final CreditProperties properties;
	private final RealtimeNotifier realtime;

	public CreditService(ProjectCreditAccountRepository accounts, CreditLedgerRepository ledger,
			ProjectMembershipRepository memberships, CreditProperties properties, RealtimeNotifier realtime) {
		this.accounts = accounts;
		this.ledger = ledger;
		this.memberships = memberships;
		this.properties = properties;
		this.realtime = realtime;
	}

	public void initialize(Project project) {
		if (accounts.existsById(project.getId())) return;
		long grant = properties.initialProjectGrant();
		var account = accounts.saveAndFlush(new ProjectCreditAccount(project, grant));
		if (grant > 0) ledger.save(new CreditLedgerEntry(project, null, grant, CreditMovementType.GRANT,
				"project:" + project.getId() + ":initial-grant:v1"));
		notifyBalance(account);
	}

	public void reserve(GenerationJob job) {
		long amount = job.getCreditCost();
		var account = lock(job.getProject().getId());
		String key = key(job, CreditMovementType.RESERVE);
		if (ledger.findByIdempotencyKey(key).isPresent()) return;
		account.reserve(amount);
		ledger.save(new CreditLedgerEntry(job.getProject(), job, amount, CreditMovementType.RESERVE, key));
		notifyBalance(account);
	}

	public void capture(GenerationJob job) { settle(job, CreditMovementType.CAPTURE); }
	public void release(GenerationJob job) { settle(job, CreditMovementType.RELEASE); }

	private void settle(GenerationJob job, CreditMovementType type) {
		long amount = job.getCreditCost();
		if (amount == 0) return;
		var account = lock(job.getProject().getId());
		String key = key(job, type);
		if (ledger.findByIdempotencyKey(key).isPresent()) return;
		if (ledger.findByIdempotencyKey(key(job, terminalOpposite(type))).isPresent()) return;
		if (type == CreditMovementType.CAPTURE) account.capture(amount); else account.release(amount);
		ledger.save(new CreditLedgerEntry(job.getProject(), job, amount, type, key));
		notifyBalance(account);
	}

	@Transactional(readOnly = true)
	public CreditApi.BalanceResponse balance(AppUser actor, UUID projectId) {
		requireMember(actor, projectId);
		var account = accounts.findById(projectId).orElseThrow(() -> new NotFoundException("Credit account not found"));
		return new CreditApi.BalanceResponse(projectId, account.getTotalGranted(), account.getReserved(),
				account.getConsumed(), account.available(), properties.generationCost(), account.getUpdatedAt());
	}

	@Transactional(readOnly = true)
	public CreditApi.LedgerResponse recentLedger(AppUser actor, UUID projectId) {
		requireMember(actor, projectId);
		var entries = ledger.findAllByProjectIdOrderByCreatedAtDesc(projectId,
				PageRequest.of(0, properties.ledgerLimit())).stream()
				.map(entry -> new CreditApi.LedgerEntryResponse(entry.getId(),
						entry.getGenerationJob() == null ? null : entry.getGenerationJob().getId(),
						entry.getMovementType().name(), entry.getAmount(), entry.getIdempotencyKey(),
						entry.getCreatedAt())).toList();
		return new CreditApi.LedgerResponse(entries);
	}

	private ProjectCreditAccount lock(UUID projectId) {
		return accounts.findForUpdate(projectId)
				.orElseThrow(() -> new IllegalStateException("Project credit account is missing"));
	}

	private void requireMember(AppUser actor, UUID projectId) {
		if (!memberships.existsById(new ProjectMembershipId(projectId, actor.getId()))) {
			throw new NotFoundException("Project not found");
		}
	}

	private static String key(GenerationJob job, CreditMovementType type) {
		return "generation-job:" + job.getId() + ":" + type.name().toLowerCase();
	}

	private static CreditMovementType terminalOpposite(CreditMovementType type) {
		return type == CreditMovementType.CAPTURE ? CreditMovementType.RELEASE : CreditMovementType.CAPTURE;
	}

	private void notifyBalance(ProjectCreditAccount account) {
		realtime.afterCommit(RealtimeEvent.now(RealtimeEventTypes.CREDITS_UPDATED,
				account.getProjectId(), account.getProjectId(), Map.of(
						"totalGranted", account.getTotalGranted(),
						"reserved", account.getReserved(),
						"consumed", account.getConsumed(),
						"available", account.available())));
	}
}
