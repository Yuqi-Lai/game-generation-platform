package com.gamegeneration.platform.generation;

import java.time.Instant;
import java.util.List;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GenerationLifecycleSweeper {
	private final GenerationJobRepository jobs;
	private final GenerationLifecycleService lifecycle;
	private final GenerationProperties properties;

	public GenerationLifecycleSweeper(GenerationJobRepository jobs,
			GenerationLifecycleService lifecycle, GenerationProperties properties) {
		this.jobs = jobs;
		this.lifecycle = lifecycle;
		this.properties = properties;
	}

	@Scheduled(fixedDelayString = "${app.generation.sweep-delay-ms:5000}")
	public void sweep() {
		Instant timeoutCutoff = Instant.now().minusSeconds(properties.timeoutSeconds());
		for (var id : jobs.findStaleIds(
				List.of(GenerationJobStatus.QUEUED, GenerationJobStatus.RUNNING), timeoutCutoff)) {
			lifecycle.timeOutIfStale(id, timeoutCutoff);
		}
		Instant cancellationCutoff = Instant.now().minusSeconds(properties.cancellationGraceSeconds());
		for (var id : jobs.findCancellationIds(GenerationJobStatus.CANCEL_REQUESTED, cancellationCutoff)) {
			lifecycle.cancelIfGraceElapsed(id, cancellationCutoff);
		}
	}
}
