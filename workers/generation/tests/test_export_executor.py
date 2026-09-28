import hashlib
import io
import json
import zipfile
from uuid import uuid4

from generation_worker.export_contracts import ContentPackExportRequested
from generation_worker.export_executor import ContentPackExportExecutor


class MemoryExportStorage:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}
        self.json_values: dict[tuple[str, str], dict] = {}

    def get_bytes(self, bucket: str, key: str) -> bytes:
        return self.objects[(bucket, key)]

    def get_json(self, key: str, bucket: str | None = None):
        return self.json_values.get((bucket or "default", key))

    def put_object(self, bucket: str, key: str, body: bytes, content_type: str):
        self.objects[(bucket, key)] = body

    def put_json(self, key: str, value: dict, bucket: str | None = None):
        self.json_values[(bucket or "default", key)] = value
        return json.dumps(value).encode()


def command(asset_sha: str) -> ContentPackExportRequested:
    return ContentPackExportRequested.model_validate({
        "eventId": str(uuid4()),
        "eventType": "ContentPackExportRequested",
        "schemaVersion": 1,
        "occurredAt": "2026-01-01T00:00:00Z",
        "exportJobId": str(uuid4()),
        "packId": str(uuid4()),
        "projectId": str(uuid4()),
        "executionKey": str(uuid4()),
        "artifactBucket": "exports",
        "artifactKey": "packs/synthetic.zip",
        "items": [{
            "contentVersionId": str(uuid4()),
            "versionNumber": 3,
            "title": "Synthetic Quest",
            "contentType": "GAME_CONTENT",
            "content": {"title": "Synthetic Quest"},
            "assets": [{
                "assetType": "COVER_IMAGE",
                "bucket": "assets",
                "key": "safe/cover.png",
                "contentType": "image/png",
                "sizeBytes": 3,
                "sha256": asset_sha,
                "metadata": {"role": "cover"},
            }],
        }],
    })


def test_export_is_reproducible_and_duplicate_delivery_reuses_result():
    storage = MemoryExportStorage()
    storage.objects[("assets", "safe/cover.png")] = b"png"
    request = command(hashlib.sha256(b"png").hexdigest())
    executor = ContentPackExportExecutor(storage)

    first = executor.execute(request, "worker-1")
    second = executor.execute(request, "worker-2")

    assert first.event_type == "ContentPackExportSucceeded"
    assert second.event_id == first.event_id
    archive_body = storage.objects[("exports", "packs/synthetic.zip")]
    assert hashlib.sha256(archive_body).hexdigest() == first.sha256
    with zipfile.ZipFile(io.BytesIO(archive_body)) as archive:
        manifest = json.loads(archive.read("manifest.json"))
        assert manifest["schemaVersion"] == 1
        assert manifest["packId"] == str(request.pack_id)
        assert manifest["items"][0]["contentVersionId"] == str(request.items[0].content_version_id)
        assert manifest["items"][0]["assets"][0]["sourceKey"] == "safe/cover.png"


def test_export_failure_is_persisted_idempotently():
    storage = MemoryExportStorage()
    request = command("0" * 64)
    executor = ContentPackExportExecutor(storage)

    first = executor.execute(request, "worker-1")
    second = executor.execute(request, "worker-2")

    assert first.event_type == "ContentPackExportFailed"
    assert first.failure_code == "PACK_EXPORT_FAILED"
    assert second.event_id == first.event_id
