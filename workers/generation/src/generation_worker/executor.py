import hashlib
from typing import Protocol

from .contracts import (
    GeneratedAsset,
    GenerationExecutionFailed,
    GenerationExecutionRequested,
    GenerationExecutionSucceeded,
    ResultEvent,
)
from .generator import GenerationOutput


class Generator(Protocol):
    def generate(self, prompt: str) -> GenerationOutput: ...


class Storage(Protocol):
    bucket: str
    def get_json(self, key: str) -> dict | None: ...
    def put_bytes(self, key: str, body: bytes, content_type: str) -> None: ...
    def put_json(self, key: str, value: dict) -> bytes: ...


class GenerationExecutor:
    def __init__(self, generator: Generator, storage: Storage, model_name: str):
        self._generator = generator
        self._storage = storage
        self._model_name = model_name

    def execute(self, command: GenerationExecutionRequested) -> ResultEvent:
        result_key = f"{command.output_prefix}/result-event.json"
        previous = self._storage.get_json(result_key)
        if previous:
            if previous.get("eventType") == "GenerationExecutionSucceeded":
                return GenerationExecutionSucceeded.model_validate(previous)
            return GenerationExecutionFailed.model_validate(previous)

        try:
            output = self._generator.generate(command.prompt)
            content_key = f"{command.output_prefix}/content.json"
            image_key = f"{command.output_prefix}/cover.png"
            content_body = self._storage.put_json(
                content_key, output.content.model_dump(mode="json")
            )
            self._storage.put_bytes(image_key, output.image, output.image_content_type)
            event: ResultEvent = GenerationExecutionSucceeded(
                job_id=command.job_id,
                attempt_id=command.attempt_id,
                execution_key=command.execution_key,
                model=output.model,
                title=output.content.title,
                content=output.content.model_dump(mode="json"),
                assets=[
                    GeneratedAsset(
                        asset_type="CONTENT_JSON",
                        bucket=self._storage.bucket,
                        key=content_key,
                        content_type="application/json",
                        size_bytes=len(content_body),
                        sha256=hashlib.sha256(content_body).hexdigest(),
                    ),
                    GeneratedAsset(
                        asset_type="COVER_IMAGE",
                        bucket=self._storage.bucket,
                        key=image_key,
                        content_type=output.image_content_type,
                        size_bytes=len(output.image),
                        sha256=hashlib.sha256(output.image).hexdigest(),
                        metadata={"role": "cover"},
                    ),
                ],
            )
        except Exception as error:
            message = str(error) or error.__class__.__name__
            event = GenerationExecutionFailed(
                job_id=command.job_id,
                attempt_id=command.attempt_id,
                execution_key=command.execution_key,
                model=self._model_name,
                failure_code="GENERATION_FAILED",
                failure_message=message[:2000],
            )

        self._storage.put_json(result_key, event.model_dump(mode="json", by_alias=True))
        return event
