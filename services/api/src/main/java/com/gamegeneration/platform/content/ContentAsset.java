package com.gamegeneration.platform.content;

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
@Table(name = "content_asset")
public class ContentAsset {
	@Id private UUID id;
	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "content_version_id", nullable = false)
	private ContentVersion contentVersion;
	@Column(name = "asset_type", nullable = false, length = 80) private String assetType;
	@Column(name = "s3_bucket", nullable = false) private String s3Bucket;
	@Column(name = "s3_key", nullable = false, length = 1024) private String s3Key;
	@Column(name = "content_type", nullable = false) private String contentType;
	@Column(name = "size_bytes", nullable = false) private long sizeBytes;
	@Column(nullable = false, length = 64) private String sha256;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false, columnDefinition = "jsonb") private String metadata;
	@Column(name = "created_at", nullable = false) private Instant createdAt;

	protected ContentAsset() {}
	public ContentAsset(ContentVersion version, String assetType, String bucket, String key,
			String contentType, long sizeBytes, String sha256, String metadata) {
		this.id = UUID.randomUUID();
		this.contentVersion = version;
		this.assetType = assetType;
		this.s3Bucket = bucket;
		this.s3Key = key;
		this.contentType = contentType;
		this.sizeBytes = sizeBytes;
		this.sha256 = sha256;
		this.metadata = metadata;
	}
	@PrePersist void prePersist() { createdAt = Instant.now(); }
	public UUID getId() { return id; }
	public String getAssetType() { return assetType; }
	public String getS3Bucket() { return s3Bucket; }
	public String getS3Key() { return s3Key; }
	public String getContentType() { return contentType; }
	public long getSizeBytes() { return sizeBytes; }
	public String getSha256() { return sha256; }
	public String getMetadata() { return metadata; }
}
