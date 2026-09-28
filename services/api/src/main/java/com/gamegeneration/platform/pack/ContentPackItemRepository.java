package com.gamegeneration.platform.pack;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContentPackItemRepository extends JpaRepository<ContentPackItem, UUID> {
	List<ContentPackItem> findAllByContentPackIdOrderByCreatedAtAsc(UUID packId);
	Optional<ContentPackItem> findByContentPackIdAndContentVersionId(UUID packId, UUID versionId);
	long countByContentPackId(UUID packId);
}
