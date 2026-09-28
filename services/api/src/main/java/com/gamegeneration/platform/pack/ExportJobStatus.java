package com.gamegeneration.platform.pack;

public enum ExportJobStatus {
	QUEUED,
	RUNNING,
	SUCCEEDED,
	FAILED;

	public boolean isTerminal() { return this == SUCCEEDED || this == FAILED; }
}
