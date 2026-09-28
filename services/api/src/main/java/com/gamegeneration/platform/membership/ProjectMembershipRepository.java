package com.gamegeneration.platform.membership;

import com.gamegeneration.platform.project.ProjectRole;
import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProjectMembershipRepository extends JpaRepository<ProjectMembership, ProjectMembershipId> {
	List<ProjectMembership> findAllByIdProjectIdOrderByCreatedAtAsc(UUID projectId);

	long countByIdProjectIdAndRole(UUID projectId, ProjectRole role);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select membership from ProjectMembership membership "
			+ "where membership.id.projectId = :projectId and membership.id.userId = :userId")
	Optional<ProjectMembership> findForUpdate(@Param("projectId") UUID projectId, @Param("userId") UUID userId);
}
