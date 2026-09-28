package com.gamegeneration.platform.content;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ContentAssetRepository extends JpaRepository<ContentAsset, UUID> {
	List<ContentAsset> findAllByContentVersionIdOrderByCreatedAtAsc(UUID contentVersionId);
}
