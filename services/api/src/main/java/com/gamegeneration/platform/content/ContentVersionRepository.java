package com.gamegeneration.platform.content;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ContentVersionRepository extends JpaRepository<ContentVersion, UUID> {
	Optional<ContentVersion> findBySourceGenerationJobId(UUID jobId);

	@Query("select coalesce(max(version.versionNumber), 0) from ContentVersion version where version.project.id = :projectId")
	int findMaxVersionNumber(@Param("projectId") UUID projectId);
}
