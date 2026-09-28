package com.gamegeneration.platform.generation;

import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class GenerationLifecycleService {
	private final GenerationJobRepository jobs;

	public GenerationLifecycleService(GenerationJobRepository jobs) {
		this.jobs = jobs;
	}

	@Transactional
	public void timeOutIfStale(UUID jobId, Instant cutoff) {
		var job = jobs.findForUpdate(jobId).orElse(null);
		if (job == null || job.getStatus().isTerminal() || job.getStatus() == GenerationJobStatus.CANCEL_REQUESTED
				|| !job.getUpdatedAt().isBefore(cutoff)) return;
		if (job.getActiveAttempt() != null) job.getActiveAttempt().timeOut();
		job.timeOut();
	}

	@Transactional
	public void cancelIfGraceElapsed(UUID jobId, Instant cutoff) {
		var job = jobs.findForUpdate(jobId).orElse(null);
		if (job == null || job.getStatus() != GenerationJobStatus.CANCEL_REQUESTED
				|| job.getCancelRequestedAt() == null || !job.getCancelRequestedAt().isBefore(cutoff)) return;
		if (job.getActiveAttempt() != null) job.getActiveAttempt().cancel();
		job.cancel();
	}
}
