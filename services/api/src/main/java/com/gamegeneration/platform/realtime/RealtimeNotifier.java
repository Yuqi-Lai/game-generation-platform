package com.gamegeneration.platform.realtime;

public interface RealtimeNotifier {
	void afterCommit(RealtimeEvent event);
}
