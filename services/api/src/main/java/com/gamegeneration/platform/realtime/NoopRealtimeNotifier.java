package com.gamegeneration.platform.realtime;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.realtime.enabled", havingValue = "false")
final class NoopRealtimeNotifier implements RealtimeNotifier {
	@Override public void afterCommit(RealtimeEvent event) {}
}
