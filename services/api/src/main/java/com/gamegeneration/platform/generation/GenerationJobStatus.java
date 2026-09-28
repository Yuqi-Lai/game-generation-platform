package com.gamegeneration.platform.generation;

public enum GenerationJobStatus {
	QUEUED,
	RUNNING,
	SUCCEEDED,
	FAILED,
	CANCEL_REQUESTED,
	CANCELLED,
	TIMED_OUT;

	public boolean isTerminal() {
		return this == SUCCEEDED || this == FAILED || this == CANCELLED || this == TIMED_OUT;
	}
}
