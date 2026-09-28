CREATE TABLE generation_job (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES project(id),
    requested_by_user_id UUID NOT NULL REFERENCES app_user(id),
    request_prompt TEXT NOT NULL,
    status VARCHAR(30) NOT NULL,
    active_attempt_id UUID,
    result_content_version_id UUID,
    failure_code VARCHAR(100),
    failure_message TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_generation_job_status CHECK (status IN ('QUEUED', 'SUCCEEDED', 'FAILED'))
);

CREATE TABLE generation_attempt (
    id UUID PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES generation_job(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL,
    execution_key UUID NOT NULL,
    status VARCHAR(30) NOT NULL,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    failure_code VARCHAR(100),
    failure_message TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_generation_attempt_number UNIQUE (job_id, attempt_number),
    CONSTRAINT uq_generation_attempt_execution UNIQUE (execution_key),
    CONSTRAINT ck_generation_attempt_status CHECK (status IN ('QUEUED', 'SUCCEEDED', 'FAILED'))
);

ALTER TABLE generation_job
    ADD CONSTRAINT fk_generation_job_active_attempt
    FOREIGN KEY (active_attempt_id) REFERENCES generation_attempt(id);

CREATE TABLE outbox_event (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(160) NOT NULL,
    topic VARCHAR(255) NOT NULL,
    event_key VARCHAR(255) NOT NULL,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    publish_attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000)
);

CREATE INDEX idx_outbox_event_unpublished
    ON outbox_event (created_at)
    WHERE published_at IS NULL;

CREATE TABLE inbox_event (
    event_id UUID PRIMARY KEY,
    event_type VARCHAR(160) NOT NULL,
    processed_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE content_version (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES project(id),
    source_generation_job_id UUID NOT NULL REFERENCES generation_job(id),
    version_number INTEGER NOT NULL,
    status VARCHAR(30) NOT NULL,
    title VARCHAR(200) NOT NULL,
    structured_content JSONB NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_content_version_project_number UNIQUE (project_id, version_number),
    CONSTRAINT uq_content_version_source_job UNIQUE (source_generation_job_id),
    CONSTRAINT ck_content_version_status CHECK (status IN ('DRAFT'))
);

CREATE TABLE content_asset (
    id UUID PRIMARY KEY,
    content_version_id UUID NOT NULL REFERENCES content_version(id) ON DELETE CASCADE,
    asset_type VARCHAR(80) NOT NULL,
    s3_bucket VARCHAR(255) NOT NULL,
    s3_key VARCHAR(1024) NOT NULL,
    content_type VARCHAR(255) NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 VARCHAR(64) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT uq_content_asset_object UNIQUE (s3_bucket, s3_key)
);

ALTER TABLE generation_job
    ADD CONSTRAINT fk_generation_job_result_version
    FOREIGN KEY (result_content_version_id) REFERENCES content_version(id);

CREATE INDEX idx_generation_job_project_created
    ON generation_job (project_id, created_at DESC);

CREATE INDEX idx_content_version_project_created
    ON content_version (project_id, created_at DESC);
