package com.gamegeneration.platform.outbox;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {
	@Query(value = "select * from outbox_event where published_at is null order by created_at for update skip locked limit 50",
			nativeQuery = true)
	List<OutboxEvent> lockNextUnpublished();
}
