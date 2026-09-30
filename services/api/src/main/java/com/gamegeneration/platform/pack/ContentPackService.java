package com.gamegeneration.platform.pack;

import tools.jackson.databind.ObjectMapper;
import com.gamegeneration.platform.content.ContentAssetRepository;
import com.gamegeneration.platform.content.ContentVersionRepository;
import com.gamegeneration.platform.content.ContentVersionStatus;
import com.gamegeneration.platform.membership.ProjectMembership;
import com.gamegeneration.platform.membership.ProjectMembershipId;
import com.gamegeneration.platform.membership.ProjectMembershipRepository;
import com.gamegeneration.platform.outbox.OutboxEvent;
import com.gamegeneration.platform.outbox.OutboxEventRepository;
import com.gamegeneration.platform.project.ProjectRepository;
import com.gamegeneration.platform.project.ProjectRole;
import com.gamegeneration.platform.project.ProjectStatus;
import com.gamegeneration.platform.realtime.RealtimeEvent;
import com.gamegeneration.platform.realtime.RealtimeEventTypes;
import com.gamegeneration.platform.realtime.RealtimeNotifier;
import com.gamegeneration.platform.shared.ConflictException;
import com.gamegeneration.platform.shared.ForbiddenException;
import com.gamegeneration.platform.shared.NotFoundException;
import com.gamegeneration.platform.user.AppUser;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ContentPackService {
	private static final String CONTENT_TYPE = "GAME_CONTENT";
	private final ProjectRepository projects;
	private final ProjectMembershipRepository memberships;
	private final ContentPackRepository packs;
	private final ContentPackItemRepository items;
	private final ExportJobRepository exportJobs;
	private final ContentVersionRepository versions;
	private final ContentAssetRepository assets;
	private final OutboxEventRepository outbox;
	private final ContentPackProperties properties;
	private final ObjectMapper objectMapper;
	private final RealtimeNotifier realtime;

	public ContentPackService(ProjectRepository projects, ProjectMembershipRepository memberships,
			ContentPackRepository packs, ContentPackItemRepository items, ExportJobRepository exportJobs,
			ContentVersionRepository versions, ContentAssetRepository assets,
			OutboxEventRepository outbox, ContentPackProperties properties, ObjectMapper objectMapper,
			RealtimeNotifier realtime) {
		this.projects = projects;
		this.memberships = memberships;
		this.packs = packs;
		this.items = items;
		this.exportJobs = exportJobs;
		this.versions = versions;
		this.assets = assets;
		this.outbox = outbox;
		this.properties = properties;
		this.objectMapper = objectMapper;
		this.realtime = realtime;
	}

	@Transactional
	public ContentPackApi.PackResponse create(AppUser actor, UUID projectId, ContentPackApi.CreatePackRequest request) {
		var membership = requireEditor(actor, projectId);
		var project = projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		if (project.getStatus() != ProjectStatus.ACTIVE) throw new ConflictException("Archived projects cannot create packs");
		var pack = packs.save(new ContentPack(project, request.name().trim(), actor));
		notifyPack(pack, "created");
		return response(pack, membership);
	}

	@Transactional(readOnly = true)
	public List<ContentPackApi.PackResponse> list(AppUser actor, UUID projectId) {
		var membership = requireMember(actor, projectId);
		return packs.findAllByProjectIdOrderByCreatedAtDesc(projectId).stream()
				.map(pack -> response(pack, membership)).toList();
	}

	@Transactional(readOnly = true)
	public ContentPackApi.PackResponse get(AppUser actor, UUID projectId, UUID packId) {
		return response(requirePack(projectId, packId), requireMember(actor, projectId));
	}

	@Transactional
	public ContentPackApi.PackResponse addItem(AppUser actor, UUID projectId, UUID packId,
			ContentPackApi.AddItemRequest request) {
		var membership = requireEditor(actor, projectId);
		projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		var pack = requirePackForUpdate(projectId, packId);
		requireDraft(pack);
		var existing = items.findByContentPackIdAndContentVersionId(packId, request.contentVersionId());
		if (existing.isPresent()) return response(pack, membership);
		var version = versions.findById(request.contentVersionId())
				.orElseThrow(() -> new NotFoundException("Content version not found"));
		if (!version.getProject().getId().equals(projectId)) {
			throw new ConflictException("Content version belongs to a different project");
		}
		if (version.getStatus() != ContentVersionStatus.APPROVED) {
			throw new ConflictException("Only approved content versions can be added to a pack");
		}
		var assetSnapshots = assets.findAllByContentVersionIdOrderByCreatedAtAsc(version.getId()).stream()
				.map(asset -> new ContentPackApi.AssetSnapshot(asset.getAssetType(), asset.getS3Bucket(),
						asset.getS3Key(), asset.getContentType(), asset.getSizeBytes(), asset.getSha256(),
						objectMapper.convertValue(objectMapper.readTree(asset.getMetadata()), java.util.Map.class)))
				.toList();
		items.save(new ContentPackItem(pack, version, CONTENT_TYPE, version.getStructuredContent(),
				objectMapper.writeValueAsString(assetSnapshots), actor));
		notifyPack(pack, "item-added");
		return response(pack, membership);
	}

	@Transactional
	public ContentPackApi.PackResponse removeItem(AppUser actor, UUID projectId, UUID packId, UUID versionId) {
		var membership = requireEditor(actor, projectId);
		projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		var pack = requirePackForUpdate(projectId, packId);
		requireDraft(pack);
		items.findByContentPackIdAndContentVersionId(packId, versionId).ifPresent(items::delete);
		notifyPack(pack, "item-removed");
		return response(pack, membership);
	}

	@Transactional
	public ContentPackApi.PackResponse ready(AppUser actor, UUID projectId, UUID packId) {
		var membership = requireEditor(actor, projectId);
		projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		var pack = requirePackForUpdate(projectId, packId);
		if (pack.getStatus() == ContentPackStatus.READY) return response(pack, membership);
		requireDraft(pack);
		if (items.countByContentPackId(packId) == 0) throw new ConflictException("A pack must contain at least one version");
		pack.ready();
		notifyPack(pack, "ready");
		return response(pack, membership);
	}

	@Transactional
	public ContentPackApi.PackResponse startExport(AppUser actor, UUID projectId, UUID packId,
			ContentPackApi.StartExportRequest command) {
		var membership = requireEditor(actor, projectId);
		projects.findForUpdate(projectId).orElseThrow(() -> new NotFoundException("Project not found"));
		var pack = requirePackForUpdate(projectId, packId);
		var existing = exportJobs.findByContentPackId(packId);
		if (existing.isPresent()) return response(pack, membership);
		if (pack.getStatus() != ContentPackStatus.READY) throw new ConflictException("Only READY packs can be exported");
		String prefix = "projects/%s/content-packs/%s/exports".formatted(projectId, packId);
		var job = exportJobs.saveAndFlush(new ExportJob(pack, actor, command.requestId(), prefix));
		var eventItems = items.findAllByContentPackIdOrderByCreatedAtAsc(packId).stream()
				.map(item -> new ContentPackEvents.Item(item.getContentVersion().getId(), item.getSnapshotVersionNumber(),
						item.getSnapshotTitle(), item.getSnapshotContentType(),
						objectMapper.readTree(item.getSnapshotStructuredContent()),
						objectMapper.readTree(item.getSnapshotAssets()))).toList();
		UUID eventId = UUID.randomUUID();
		var event = new ContentPackEvents.Requested(eventId, ContentPackEvents.REQUESTED, 1, Instant.now(),
				job.getId(), packId, projectId, job.getExecutionKey(), properties.artifactBucket(),
				job.getArtifactKey(), eventItems);
		outbox.save(new OutboxEvent(eventId, "ContentPack", packId, ContentPackEvents.REQUESTED,
				properties.requestTopic(), packId.toString(), objectMapper.writeValueAsString(event)));
		pack.startExport();
		notifyPack(pack, "export-started");
		return response(pack, membership);
	}

	void notifyPack(ContentPack pack, String change) {
		realtime.afterCommit(RealtimeEvent.now(RealtimeEventTypes.CONTENT_PACK_UPDATED,
				pack.getProject().getId(), pack.getId(), Map.of(
						"status", pack.getStatus().name(),
						"change", change)));
	}

	ContentPackApi.PackResponse response(ContentPack pack, ProjectMembership membership) {
		var itemResponses = items.findAllByContentPackIdOrderByCreatedAtAsc(pack.getId()).stream()
				.map(item -> new ContentPackApi.ItemResponse(item.getId(), item.getContentVersion().getId(),
						item.getSnapshotVersionNumber(), item.getSnapshotTitle(), item.getSnapshotContentType(),
						objectMapper.readTree(item.getSnapshotStructuredContent()),
						objectMapper.readTree(item.getSnapshotAssets()), item.getCreatedAt())).toList();
		var export = exportJobs.findByContentPackId(pack.getId()).map(this::exportResponse).orElse(null);
		boolean editor = membership.getRole() == ProjectRole.OWNER || membership.getRole() == ProjectRole.EDITOR;
		return new ContentPackApi.PackResponse(pack.getId(), pack.getProject().getId(), pack.getName(),
				pack.getStatus().name(), itemResponses, export, editor && pack.getStatus() == ContentPackStatus.DRAFT,
				editor && pack.getStatus() == ContentPackStatus.READY,
				pack.getCreatedAt(), pack.getUpdatedAt());
	}

	private ContentPackApi.ExportJobResponse exportResponse(ExportJob job) {
		String uri = job.getArtifactBucket() == null ? null : "s3://" + job.getArtifactBucket() + "/" + job.getArtifactKey();
		return new ContentPackApi.ExportJobResponse(job.getId(), job.getStatus().name(), job.getArtifactBucket(),
				job.getArtifactKey(), uri, job.getArtifactContentType(), job.getArtifactSizeBytes(),
				job.getArtifactSha256(), job.getFailureCode(), job.getFailureMessage(), job.getCreatedAt(),
				job.getStartedAt(), job.getCompletedAt());
	}

	private ContentPack requirePack(UUID projectId, UUID packId) {
		var pack = packs.findById(packId).orElseThrow(() -> new NotFoundException("Content pack not found"));
		if (!pack.getProject().getId().equals(projectId)) throw new NotFoundException("Content pack not found");
		return pack;
	}
	private ContentPack requirePackForUpdate(UUID projectId, UUID packId) {
		var pack = packs.findForUpdate(packId).orElseThrow(() -> new NotFoundException("Content pack not found"));
		if (!pack.getProject().getId().equals(projectId)) throw new NotFoundException("Content pack not found");
		return pack;
	}
	private void requireDraft(ContentPack pack) {
		if (pack.getStatus() != ContentPackStatus.DRAFT) throw new ConflictException("Pack composition is immutable after READY");
	}
	private ProjectMembership requireMember(AppUser actor, UUID projectId) {
		return memberships.findById(new ProjectMembershipId(projectId, actor.getId()))
				.orElseThrow(() -> new NotFoundException("Project not found"));
	}
	private ProjectMembership requireEditor(AppUser actor, UUID projectId) {
		var membership = requireMember(actor, projectId);
		if (membership.getRole() != ProjectRole.OWNER && membership.getRole() != ProjectRole.EDITOR) {
			throw new ForbiddenException("Owner or editor access is required to manage content packs");
		}
		return membership;
	}
}
