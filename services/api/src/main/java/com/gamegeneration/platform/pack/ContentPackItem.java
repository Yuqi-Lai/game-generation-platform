package com.gamegeneration.platform.pack;

import com.gamegeneration.platform.content.ContentVersion;
import com.gamegeneration.platform.user.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

@Entity
@Table(name = "content_pack_item")
public class ContentPackItem {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "content_pack_id", nullable = false) private ContentPack contentPack;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "content_version_id", nullable = false) private ContentVersion contentVersion;
	@Column(name = "snapshot_version_number", nullable = false) private int snapshotVersionNumber;
	@Column(name = "snapshot_title", nullable = false, length = 200) private String snapshotTitle;
	@Column(name = "snapshot_content_type", nullable = false, length = 100) private String snapshotContentType;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "snapshot_structured_content", nullable = false, columnDefinition = "jsonb")
	private String snapshotStructuredContent;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(name = "snapshot_assets", nullable = false, columnDefinition = "jsonb") private String snapshotAssets;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "added_by_user_id", nullable = false) private AppUser addedBy;
	@Column(name = "created_at", nullable = false) private Instant createdAt;

	protected ContentPackItem() {}
	public ContentPackItem(ContentPack pack, ContentVersion version, String contentType,
			String structuredContent, String assets, AppUser addedBy) {
		this.id = UUID.randomUUID();
		this.contentPack = pack;
		this.contentVersion = version;
		this.snapshotVersionNumber = version.getVersionNumber();
		this.snapshotTitle = version.getTitle();
		this.snapshotContentType = contentType;
		this.snapshotStructuredContent = structuredContent;
		this.snapshotAssets = assets;
		this.addedBy = addedBy;
	}
	@PrePersist void prePersist() { createdAt = Instant.now(); }
	public UUID getId() { return id; }
	public ContentPack getContentPack() { return contentPack; }
	public ContentVersion getContentVersion() { return contentVersion; }
	public int getSnapshotVersionNumber() { return snapshotVersionNumber; }
	public String getSnapshotTitle() { return snapshotTitle; }
	public String getSnapshotContentType() { return snapshotContentType; }
	public String getSnapshotStructuredContent() { return snapshotStructuredContent; }
	public String getSnapshotAssets() { return snapshotAssets; }
	public Instant getCreatedAt() { return createdAt; }
}
