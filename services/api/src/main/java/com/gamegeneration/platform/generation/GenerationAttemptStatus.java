package com.gamegeneration.platform.generation;

public enum GenerationAttemptStatus {
	QUEUED,
	RUNNING,
	SUCCEEDED,
	FAILED,
	CANCELLED,
	TIMED_OUT;

	public boolean isTerminal() {
		return this == SUCCEEDED || this == FAILED || this == CANCELLED || this == TIMED_OUT;
	}
}
