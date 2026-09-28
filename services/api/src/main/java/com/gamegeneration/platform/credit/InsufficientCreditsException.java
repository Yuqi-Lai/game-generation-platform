package com.gamegeneration.platform.credit;

import com.gamegeneration.platform.shared.ConflictException;

public class InsufficientCreditsException extends ConflictException {
	public InsufficientCreditsException(long required, long available) {
		super("Insufficient project credits: " + required + " required, " + available + " available");
	}
}
