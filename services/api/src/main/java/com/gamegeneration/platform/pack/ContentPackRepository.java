package com.gamegeneration.platform.pack;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ContentPackRepository extends JpaRepository<ContentPack, UUID> {
	List<ContentPack> findAllByProjectIdOrderByCreatedAtDesc(UUID projectId);
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select pack from ContentPack pack where pack.id = :packId")
	Optional<ContentPack> findForUpdate(@Param("packId") UUID packId);
}
