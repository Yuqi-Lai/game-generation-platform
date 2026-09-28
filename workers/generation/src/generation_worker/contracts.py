from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=lambda value: "".join(
        [value.split("_")[0], *[part.title() for part in value.split("_")[1:]]]
    ), populate_by_name=True)


class GenerationExecutionRequested(CamelModel):
    event_id: UUID
    event_type: Literal["GenerationExecutionRequested"]
    schema_version: Literal[1]
    occurred_at: datetime
    job_id: UUID
    attempt_id: UUID
    execution_key: UUID
    project_id: UUID
    attempt_number: int
    prompt: str
    output_prefix: str


class GenerationExecutionStarted(CamelModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["GenerationExecutionStarted"] = "GenerationExecutionStarted"
    schema_version: Literal[1] = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    job_id: UUID
    attempt_id: UUID
    execution_key: UUID
    worker_execution_id: str


class GeneratedAsset(CamelModel):
    asset_type: str
    bucket: str
    key: str
    content_type: str
    size_bytes: int
    sha256: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class GenerationExecutionSucceeded(CamelModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["GenerationExecutionSucceeded"] = "GenerationExecutionSucceeded"
    schema_version: Literal[1] = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    job_id: UUID
    attempt_id: UUID
    execution_key: UUID
    provider: str = "GEMINI"
    model: str
    worker_execution_id: str
    title: str
    content: dict[str, Any]
    assets: list[GeneratedAsset]


class GenerationExecutionFailed(CamelModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["GenerationExecutionFailed"] = "GenerationExecutionFailed"
    schema_version: Literal[1] = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    job_id: UUID
    attempt_id: UUID
    execution_key: UUID
    provider: str = "GEMINI"
    model: str
    worker_execution_id: str
    failure_code: str
    failure_message: str
    retryable: bool


class Character(BaseModel):
    name: str
    outfit: str


class Scene(BaseModel):
    title: str
    location: str
    objective: str
    dialogue: list[str] = Field(default_factory=list)


class GameContent(BaseModel):
    title: str
    synopsis: str
    opening_remarks: str
    player: Character
    npcs: list[Character]
    scenes: list[Scene]


ResultEvent = GenerationExecutionSucceeded | GenerationExecutionFailed
