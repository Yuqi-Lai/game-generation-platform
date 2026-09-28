package com.gamegeneration.platform.user;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {
	Optional<AppUser> findByAuthIssuerAndAuthSubject(String authIssuer, String authSubject);
}
