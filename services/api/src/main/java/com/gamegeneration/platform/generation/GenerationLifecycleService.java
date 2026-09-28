package com.gamegeneration.platform.generation;

import com.gamegeneration.platform.credit.CreditService;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GenerationLifecycleService {
	private final GenerationJobRepository jobs;
	private final CreditService credits;

	public GenerationLifecycleService(GenerationJobRepository jobs, CreditService credits) {
		this.jobs = jobs;
		this.credits = credits;
	}

	@Transactional
	public void timeOutIfStale(UUID jobId, Instant cutoff) {
		var job = jobs.findForUpdate(jobId).orElse(null);
		if (job == null || job.getStatus().isTerminal() || job.getStatus() == GenerationJobStatus.CANCEL_REQUESTED
				|| !job.getUpdatedAt().isBefore(cutoff)) return;
		if (job.getActiveAttempt() != null) job.getActiveAttempt().timeOut();
		job.timeOut();
		credits.release(job);
	}

	@Transactional
	public void cancelIfGraceElapsed(UUID jobId, Instant cutoff) {
		var job = jobs.findForUpdate(jobId).orElse(null);
		if (job == null || job.getStatus() != GenerationJobStatus.CANCEL_REQUESTED
				|| job.getCancelRequestedAt() == null || !job.getCancelRequestedAt().isBefore(cutoff)) return;
		if (job.getActiveAttempt() != null) job.getActiveAttempt().cancel();
		job.cancel();
		credits.release(job);
	}
}
