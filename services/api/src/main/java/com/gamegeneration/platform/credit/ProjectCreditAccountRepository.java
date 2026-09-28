package com.gamegeneration.platform.credit;

import jakarta.persistence.LockModeType;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ProjectCreditAccountRepository extends JpaRepository<ProjectCreditAccount, UUID> {
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select account from ProjectCreditAccount account where account.projectId = :projectId")
	Optional<ProjectCreditAccount> findForUpdate(@Param("projectId") UUID projectId);
}
