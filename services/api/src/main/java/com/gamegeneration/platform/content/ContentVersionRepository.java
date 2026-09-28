package com.gamegeneration.platform.content;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ContentVersionRepository extends JpaRepository<ContentVersion, UUID> {
	Optional<ContentVersion> findBySourceGenerationJobId(UUID jobId);
	List<ContentVersion> findAllByProjectIdOrderByVersionNumberDesc(UUID projectId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select version from ContentVersion version where version.id = :versionId")
	Optional<ContentVersion> findForUpdate(@Param("versionId") UUID versionId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select version from ContentVersion version where version.project.id = :projectId "
			+ "and version.status = :status order by version.versionNumber")
	List<ContentVersion> findAllByProjectIdAndStatusForUpdate(@Param("projectId") UUID projectId,
			@Param("status") ContentVersionStatus status);

	@Query("select coalesce(max(version.versionNumber), 0) from ContentVersion version where version.project.id = :projectId")
	int findMaxVersionNumber(@Param("projectId") UUID projectId);
}
