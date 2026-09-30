"""S3Storage against a real S3 API.

The rest of the worker suite passes a fake storage object, which is right for
testing executor logic but proves nothing about the client itself: that the
endpoint and addressing style are wired correctly, that ContentType survives a
round trip, that a missing key comes back as None instead of raising, or that
put_json's bytes are the bytes a checksum upstream will be computed over.

Runs against the LocalStack in infra/local/compose.yaml. Skipped, loudly, when
that is not up — the suite stays runnable without the local stack, but a skip
is not a pass and the reason says so.
"""

from __future__ import annotations

import json
import os
import uuid

import pytest

from generation_worker.settings import Settings
from generation_worker.storage import S3Storage

ENDPOINT = os.environ.get("S3_TEST_ENDPOINT_URL", "http://localhost:4566")


def _localstack_reachable() -> bool:
    import urllib.error
    import urllib.request

    try:
        with urllib.request.urlopen(f"{ENDPOINT}/_localstack/health", timeout=2) as response:
            return response.status == 200
    except (urllib.error.URLError, OSError):
        return False


pytestmark = pytest.mark.skipif(
    not _localstack_reachable(),
    reason=f"LocalStack not reachable at {ENDPOINT}; start infra/local/compose.yaml",
)


@pytest.fixture
def storage() -> S3Storage:
    # LocalStack accepts any credentials; boto3 still requires them to be set.
    os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
    settings = Settings(
        gemini_api_key="unused-in-this-test",
        s3_bucket=f"forge-storage-test-{uuid.uuid4().hex[:12]}",
        s3_endpoint_url=ENDPOINT,
        # Virtual-host addressing needs DNS per bucket; LocalStack wants paths.
        s3_force_path_style=True,
    )
    store = S3Storage(settings)
    store.ensure_bucket()
    return store


def test_ensure_bucket_is_idempotent(storage: S3Storage) -> None:
    # Called on every worker start, so a second call must not fail.
    storage.ensure_bucket()
    storage.ensure_bucket()


def test_put_json_returns_the_exact_bytes_it_wrote(storage: S3Storage) -> None:
    value = {"version": "playable-game-content/v1", "title": "Thaw", "scenes": []}

    written = storage.put_json("manifests/a/playable.json", value)

    # The caller checksums and reports sizeBytes from this return value, so it
    # has to be what actually landed in the bucket.
    assert storage.get_bytes(storage.bucket, "manifests/a/playable.json") == written
    # Compact separators: the manifest is content-addressed downstream.
    assert b", " not in written and b": " not in written
    assert json.loads(written) == value


def test_get_json_round_trips_and_missing_keys_are_none(storage: S3Storage) -> None:
    storage.put_json("scenes/one.json", {"id": "scene-1"})

    assert storage.get_json("scenes/one.json") == {"id": "scene-1"}
    # A miss must not raise: the executor treats None as "not generated yet".
    assert storage.get_json("scenes/absent.json") is None


def test_content_type_survives_the_round_trip(storage: S3Storage) -> None:
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    storage.put_bytes("assets/player/stand.png", png, "image/png")

    head = storage._client.head_object(Bucket=storage.bucket, Key="assets/player/stand.png")

    # The browser is served these bytes directly; a wrong type breaks decoding.
    assert head["ContentType"] == "image/png"
    assert head["ContentLength"] == len(png)
    assert storage.get_bytes(storage.bucket, "assets/player/stand.png") == png


def test_reupload_of_the_same_key_is_last_write_wins(storage: S3Storage) -> None:
    # A retried attempt rewrites the same deterministic key rather than
    # accumulating duplicates, so overwrite has to be well defined.
    storage.put_bytes("assets/bg.png", b"first", "image/png")
    storage.put_bytes("assets/bg.png", b"second", "image/png")

    assert storage.get_bytes(storage.bucket, "assets/bg.png") == b"second"


def test_put_object_can_target_another_bucket(storage: S3Storage) -> None:
    # Export archives are written to the artifact bucket, not the asset one.
    storage.put_object(storage.bucket, "packs/pack-1.zip", b"PK\x03\x04", "application/zip")

    assert storage.get_bytes(storage.bucket, "packs/pack-1.zip") == b"PK\x03\x04"
