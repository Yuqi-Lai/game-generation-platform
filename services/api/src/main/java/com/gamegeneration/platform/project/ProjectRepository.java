package com.gamegeneration.platform.project;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProjectRepository extends JpaRepository<Project, UUID> {
	@Query("select project from Project project, ProjectMembership membership "
			+ "where membership.project = project and membership.user.id = :userId "
			+ "order by project.updatedAt desc")
	List<Project> findVisibleTo(@Param("userId") UUID userId);
}
