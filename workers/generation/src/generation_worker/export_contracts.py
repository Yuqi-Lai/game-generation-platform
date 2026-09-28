from datetime import datetime, timezone
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import Field

from .contracts import CamelModel


class ExportAsset(CamelModel):
    asset_type: str
    bucket: str
    key: str
    content_type: str
    size_bytes: int
    sha256: str
    metadata: dict[str, Any] = Field(default_factory=dict)


class ExportItem(CamelModel):
    content_version_id: UUID
    version_number: int
    title: str
    content_type: str
    content: dict[str, Any]
    assets: list[ExportAsset]


class ContentPackExportRequested(CamelModel):
    event_id: UUID
    event_type: Literal["ContentPackExportRequested"]
    schema_version: Literal[1]
    occurred_at: datetime
    export_job_id: UUID
    pack_id: UUID
    project_id: UUID
    execution_key: UUID
    artifact_bucket: str
    artifact_key: str
    items: list[ExportItem]


class ContentPackExportStarted(CamelModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["ContentPackExportStarted"] = "ContentPackExportStarted"
    schema_version: Literal[1] = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    export_job_id: UUID
    pack_id: UUID
    execution_key: UUID
    worker_execution_id: str


class ContentPackExportSucceeded(CamelModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["ContentPackExportSucceeded"] = "ContentPackExportSucceeded"
    schema_version: Literal[1] = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    export_job_id: UUID
    pack_id: UUID
    execution_key: UUID
    worker_execution_id: str
    artifact_bucket: str
    artifact_key: str
    content_type: str = "application/zip"
    size_bytes: int
    sha256: str


class ContentPackExportFailed(CamelModel):
    event_id: UUID = Field(default_factory=uuid4)
    event_type: Literal["ContentPackExportFailed"] = "ContentPackExportFailed"
    schema_version: Literal[1] = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    export_job_id: UUID
    pack_id: UUID
    execution_key: UUID
    worker_execution_id: str
    failure_code: str
    failure_message: str


ExportResult = ContentPackExportSucceeded | ContentPackExportFailed
