from uuid import uuid4
import httpx

import hashlib

from generation_worker.contracts import GenerationExecutionRequested
from generation_worker.executor import GenerationExecutor
from generation_worker.generator import GeneratedPlayableAsset, GenerationOutput
from generation_worker.playable import (
    AssetDescriptor,
    CombatStats,
    GamePlan,
    PlanCharacter,
    PlanScene,
    PlayableGameContentV1,
    PlayablePlayer,
    PlayableScene,
    PlayerAssets,
    Point,
    VisualStyle,
)


class FakeGenerator:
    def __init__(self):
        self.calls = 0

    def generate(self, prompt: str, output_prefix: str) -> GenerationOutput:
        self.calls += 1
        body = b"synthetic-png"
        specs = [
            ("player.stand", "PLAYER_STAND", "stand.png", 128, 128),
            ("player.down", "PLAYER_DIRECTION", "down.png", 384, 128),
            ("player.up", "PLAYER_DIRECTION", "up.png", 384, 128),
            ("player.right", "PLAYER_DIRECTION", "right.png", 384, 128),
            ("player.avatar", "PLAYER_AVATAR", "avatar.png", 256, 256),
            ("scene.workshop.background", "SCENE_BACKGROUND", "background.png", 2560, 1440),
        ]
        assets = [GeneratedPlayableAsset(
            id=asset_id, role=role, object_key=f"{output_prefix}/{name}", body=body,
            content_type="image/png", width=width, height=height,
        ) for asset_id, role, name, width, height in specs]
        return GenerationOutput(
            content=PlayableGameContentV1(
                title="Synthetic Quest",
                opening_remarks="The path opens.",
                style=VisualStyle(
                    art_direction="Crisp clockwork pixel art",
                    palette=["brass", "teal", "cream"],
                    world_description="A bright clockwork city",
                ),
                player=PlayablePlayer(
                    id="ari", name="Ari", description="A mechanic in a green coat",
                    stats=CombatStats(hp=100, attack=10, defense=10),
                    assets=PlayerAssets(
                        stand="player.stand", down="player.down", up="player.up",
                        right="player.right", avatar="player.avatar",
                    ),
                ),
                scenes=[PlayableScene(
                    id="workshop", title="The Workshop", location="A bright workshop",
                    objective="Repair the beacon", player_spawn=Point(x=128, y=720),
                    exit=Point(x=2432, y=720), background_asset_id="scene.workshop.background",
                )],
                assets=[AssetDescriptor(
                    id=asset.id, role=asset.role, object_key=asset.object_key,
                    content_type="image/png", width=asset.width, height=asset.height,
                    sha256=hashlib.sha256(asset.body).hexdigest(),
                ) for asset in assets],
            ),
            assets=assets,
            model="fake-text+fake-image",
        )


class MemoryStorage:
    bucket = "test-bucket"

    def __init__(self):
        self.values: dict[str, bytes | dict] = {}

    def get_json(self, key: str):
        return self.values.get(key)

    def put_bytes(self, key: str, body: bytes, content_type: str):
        self.values[key] = body

    def put_json(self, key: str, value: dict):
        import json
        body = json.dumps(value, separators=(",", ":")).encode()
        self.values[key] = value if key.endswith("result-event.json") else body
        return body


def command() -> GenerationExecutionRequested:
    return GenerationExecutionRequested(
        eventId=uuid4(),
        eventType="GenerationExecutionRequested",
        schemaVersion=1,
        occurredAt="2026-01-01T00:00:00Z",
        jobId=uuid4(),
        attemptId=uuid4(),
        executionKey=uuid4(),
        projectId=uuid4(),
        attemptNumber=1,
        prompt="Create an original clockwork adventure.",
        outputPrefix="projects/test/jobs/test/attempts/test",
    )


def test_success_stores_assets_and_reuses_result_for_duplicate_command():
    generator = FakeGenerator()
    storage = MemoryStorage()
    executor = GenerationExecutor(generator, storage, "fake")
    request = command()

    first = executor.execute(request, "worker-1")
    second = executor.execute(request, "worker-2")

    assert first.event_id == second.event_id
    assert first.event_type == "GenerationExecutionSucceeded"
    assert len(first.assets) == 7
    assert generator.calls == 1
    assert f"{request.output_prefix}/playable-manifest.v1.json" in storage.values
    assert f"{request.output_prefix}/down.png" in storage.values


class FailingGenerator:
    def __init__(self, error: Exception):
        self.error = error

    def generate(self, prompt: str, output_prefix: str):
        raise self.error


def test_transient_network_failure_is_retryable():
    event = GenerationExecutor(
        FailingGenerator(httpx.ConnectError("temporary network failure")),
        MemoryStorage(),
        "fake",
    ).execute(command(), "worker-network")

    assert event.event_type == "GenerationExecutionFailed"
    assert event.retryable is True
    assert event.failure_code == "PROVIDER_NETWORK_ERROR"


def test_deterministic_validation_failure_is_not_retryable():
    event = GenerationExecutor(
        FailingGenerator(ValueError("invalid generated structure")),
        MemoryStorage(),
        "fake",
    ).execute(command(), "worker-validation")

    assert event.event_type == "GenerationExecutionFailed"
    assert event.retryable is False
    assert event.failure_code == "GENERATION_VALIDATION_FAILED"
