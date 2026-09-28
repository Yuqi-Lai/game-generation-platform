from uuid import uuid4
import httpx

from generation_worker.contracts import (
    Character,
    GameContent,
    GenerationExecutionRequested,
    Scene,
)
from generation_worker.executor import GenerationExecutor
from generation_worker.generator import GenerationOutput


class FakeGenerator:
    def __init__(self):
        self.calls = 0

    def generate(self, prompt: str) -> GenerationOutput:
        self.calls += 1
        return GenerationOutput(
            content=GameContent(
                title="Synthetic Quest",
                synopsis="A safe generated fixture.",
                opening_remarks="The path opens.",
                player=Character(name="Ari", outfit="green travel coat"),
                npcs=[Character(name="Mira", outfit="blue workshop apron")],
                scenes=[Scene(
                    title="The Workshop",
                    location="A bright clockwork workshop",
                    objective="Repair the beacon",
                    dialogue=["The beacon needs a new gear."],
                )],
            ),
            image=b"synthetic-png-bytes",
            image_content_type="image/png",
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
    assert len(first.assets) == 2
    assert generator.calls == 1
    assert f"{request.output_prefix}/content.json" in storage.values
    assert f"{request.output_prefix}/cover.png" in storage.values


class FailingGenerator:
    def __init__(self, error: Exception):
        self.error = error

    def generate(self, prompt: str):
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
