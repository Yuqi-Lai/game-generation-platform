import hashlib
import io
import json
import posixpath
import zipfile
from typing import Protocol

from .export_contracts import (
    ContentPackExportFailed,
    ContentPackExportRequested,
    ContentPackExportSucceeded,
    ExportResult,
)


class ExportStorage(Protocol):
    def get_bytes(self, bucket: str, key: str) -> bytes: ...
    def get_json(self, key: str, bucket: str | None = None) -> dict | None: ...
    def put_object(self, bucket: str, key: str, body: bytes, content_type: str) -> None: ...
    def put_json(self, key: str, value: dict, bucket: str | None = None) -> bytes: ...


class ContentPackExportExecutor:
    def __init__(self, storage: ExportStorage):
        self._storage = storage

    def execute(self, command: ContentPackExportRequested, worker_execution_id: str) -> ExportResult:
        result_key = f"{command.artifact_key}.result.json"
        previous = self._storage.get_json(result_key, command.artifact_bucket)
        if previous:
            if previous.get("eventType") == "ContentPackExportSucceeded":
                return ContentPackExportSucceeded.model_validate(previous)
            return ContentPackExportFailed.model_validate(previous)

        try:
            archive = self._archive(command)
            self._storage.put_object(
                command.artifact_bucket,
                command.artifact_key,
                archive,
                "application/zip",
            )
            result: ExportResult = ContentPackExportSucceeded(
                export_job_id=command.export_job_id,
                pack_id=command.pack_id,
                execution_key=command.execution_key,
                worker_execution_id=worker_execution_id,
                artifact_bucket=command.artifact_bucket,
                artifact_key=command.artifact_key,
                size_bytes=len(archive),
                sha256=hashlib.sha256(archive).hexdigest(),
            )
        except Exception as error:
            result = ContentPackExportFailed(
                export_job_id=command.export_job_id,
                pack_id=command.pack_id,
                execution_key=command.execution_key,
                worker_execution_id=worker_execution_id,
                failure_code="PACK_EXPORT_FAILED",
                failure_message=(str(error) or error.__class__.__name__)[:2000],
            )

        self._storage.put_json(
            result_key,
            result.model_dump(mode="json", by_alias=True),
            command.artifact_bucket,
        )
        return result

    def _archive(self, command: ContentPackExportRequested) -> bytes:
        files: list[tuple[str, bytes]] = []
        manifest_items: list[dict] = []
        for item in command.items:
            version_root = f"versions/{item.content_version_id}"
            content_path = f"{version_root}/content.json"
            files.append((content_path, _json_bytes(item.content)))
            manifest_assets: list[dict] = []
            for index, asset in enumerate(item.assets):
                body = self._storage.get_bytes(asset.bucket, asset.key)
                actual_sha = hashlib.sha256(body).hexdigest()
                if asset.sha256 and actual_sha != asset.sha256:
                    raise ValueError(f"Checksum mismatch for s3://{asset.bucket}/{asset.key}")
                filename = posixpath.basename(asset.key) or f"asset-{index}"
                archive_path = f"{version_root}/assets/{index:03d}-{filename}"
                files.append((archive_path, body))
                manifest_assets.append({
                    "assetType": asset.asset_type,
                    "sourceBucket": asset.bucket,
                    "sourceKey": asset.key,
                    "archivePath": archive_path,
                    "contentType": asset.content_type,
                    "sizeBytes": len(body),
                    "sha256": actual_sha,
                    "metadata": asset.metadata,
                })
            manifest_items.append({
                "contentVersionId": str(item.content_version_id),
                "contentType": item.content_type,
                "versionNumber": item.version_number,
                "title": item.title,
                "contentPath": content_path,
                "assets": manifest_assets,
            })
        manifest = {
            "schemaVersion": 1,
            "packId": str(command.pack_id),
            "projectId": str(command.project_id),
            "exportJobId": str(command.export_job_id),
            "exportedAt": command.occurred_at.isoformat(),
            "items": manifest_items,
        }
        files.append(("manifest.json", _json_bytes(manifest)))
        output = io.BytesIO()
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path, body in sorted(files):
                info = zipfile.ZipInfo(path, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, body, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
        return output.getvalue()


def _json_bytes(value: dict) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()
