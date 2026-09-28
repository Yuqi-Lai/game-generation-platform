CREATE TABLE content_pack (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES project(id),
    name VARCHAR(200) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_content_pack_status CHECK (status IN (
        'DRAFT', 'READY', 'EXPORTING', 'EXPORTED', 'FAILED'
    ))
);

CREATE TABLE content_pack_item (
    id UUID PRIMARY KEY,
    content_pack_id UUID NOT NULL REFERENCES content_pack(id) ON DELETE CASCADE,
    content_version_id UUID NOT NULL REFERENCES content_version(id),
    snapshot_version_number INTEGER NOT NULL,
    snapshot_title VARCHAR(200) NOT NULL,
    snapshot_content_type VARCHAR(100) NOT NULL,
    snapshot_structured_content JSONB NOT NULL,
    snapshot_assets JSONB NOT NULL,
    added_by_user_id UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_content_pack_item_version UNIQUE (content_pack_id, content_version_id)
);

CREATE TABLE export_job (
    id UUID PRIMARY KEY,
    content_pack_id UUID NOT NULL REFERENCES content_pack(id),
    requested_by_user_id UUID NOT NULL REFERENCES app_user(id),
    request_idempotency_key UUID NOT NULL,
    execution_key UUID NOT NULL,
    status VARCHAR(30) NOT NULL,
    artifact_bucket VARCHAR(255),
    artifact_key VARCHAR(1024) NOT NULL,
    artifact_content_type VARCHAR(255),
    artifact_size_bytes BIGINT,
    artifact_sha256 VARCHAR(64),
    failure_code VARCHAR(100),
    failure_message TEXT,
    worker_execution_id VARCHAR(160),
    created_at TIMESTAMPTZ NOT NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_export_job_pack UNIQUE (content_pack_id),
    CONSTRAINT uq_export_job_command UNIQUE (content_pack_id, request_idempotency_key),
    CONSTRAINT uq_export_job_execution UNIQUE (execution_key),
    CONSTRAINT ck_export_job_status CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED'))
);

CREATE TABLE export_inbox_event (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(160) NOT NULL,
    export_job_id UUID REFERENCES export_job(id),
    disposition VARCHAR(60) NOT NULL,
    detail VARCHAR(1000),
    duplicate_count INTEGER NOT NULL DEFAULT 0,
    processed_at TIMESTAMPTZ NOT NULL,
    last_received_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_content_pack_project_created ON content_pack (project_id, created_at DESC);
CREATE INDEX idx_content_pack_item_pack ON content_pack_item (content_pack_id, created_at);
CREATE INDEX idx_export_inbox_job ON export_inbox_event (export_job_id, processed_at DESC);
