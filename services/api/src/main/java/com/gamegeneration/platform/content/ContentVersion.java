package com.gamegeneration.platform.content;

import com.gamegeneration.platform.generation.GenerationJob;
import com.gamegeneration.platform.project.Project;
import com.gamegeneration.platform.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "content_version")
public class ContentVersion {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "project_id", nullable = false)
	private Project project;
	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "source_generation_job_id", nullable = false)
	private GenerationJob sourceGenerationJob;
	@Column(name = "version_number", nullable = false) private int versionNumber;
	@Enumerated(EnumType.STRING) @Column(nullable = false) private ContentVersionStatus status;
	@Column(nullable = false, length = 200) private String title;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "structured_content", nullable = false, columnDefinition = "jsonb")
	private String structuredContent;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "created_by_user_id", nullable = false)
	private AppUser createdBy;
	@Column(name = "created_at", nullable = false) private Instant createdAt;
	@Column(name = "updated_at", nullable = false) private Instant updatedAt;
	@Version @Column(name = "row_version", nullable = false) private long version;

	protected ContentVersion() {}
	public ContentVersion(Project project, GenerationJob job, int versionNumber,
			String title, String structuredContent, AppUser createdBy) {
		this.id = UUID.randomUUID();
		this.project = project;
		this.sourceGenerationJob = job;
		this.versionNumber = versionNumber;
		this.status = ContentVersionStatus.DRAFT;
		this.title = title;
		this.structuredContent = structuredContent;
		this.createdBy = createdBy;
	}
	@PrePersist void prePersist() { createdAt = updatedAt = Instant.now(); }
	@PreUpdate void preUpdate() { updatedAt = Instant.now(); }
	public UUID getId() { return id; }
	public Project getProject() { return project; }
	public GenerationJob getSourceGenerationJob() { return sourceGenerationJob; }
	public int getVersionNumber() { return versionNumber; }
	public ContentVersionStatus getStatus() { return status; }
	public String getTitle() { return title; }
	public String getStructuredContent() { return structuredContent; }
	public Instant getCreatedAt() { return createdAt; }
}
