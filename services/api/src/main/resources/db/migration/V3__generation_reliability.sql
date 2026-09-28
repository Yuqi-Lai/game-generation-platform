ALTER TABLE generation_job DROP CONSTRAINT ck_generation_job_status;
ALTER TABLE generation_job ADD CONSTRAINT ck_generation_job_status CHECK (status IN (
    'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCEL_REQUESTED', 'CANCELLED', 'TIMED_OUT'
));
ALTER TABLE generation_job ADD COLUMN request_idempotency_key UUID;
ALTER TABLE generation_job ADD COLUMN retry_of_job_id UUID REFERENCES generation_job(id);
ALTER TABLE generation_job ADD COLUMN cancel_requested_at TIMESTAMPTZ;
UPDATE generation_job SET request_idempotency_key = id WHERE request_idempotency_key IS NULL;
ALTER TABLE generation_job ALTER COLUMN request_idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX uq_generation_job_request
    ON generation_job (project_id, requested_by_user_id, request_idempotency_key);
CREATE INDEX idx_generation_job_timeout
    ON generation_job (updated_at) WHERE status IN ('QUEUED', 'RUNNING', 'CANCEL_REQUESTED');
CREATE INDEX idx_generation_job_cancellation
    ON generation_job (cancel_requested_at) WHERE status = 'CANCEL_REQUESTED';

ALTER TABLE generation_attempt DROP CONSTRAINT ck_generation_attempt_status;
ALTER TABLE generation_attempt ADD CONSTRAINT ck_generation_attempt_status CHECK (status IN (
    'QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'
));
ALTER TABLE generation_attempt RENAME COLUMN finished_at TO completed_at;
ALTER TABLE generation_attempt ADD COLUMN failure_retryable BOOLEAN;
ALTER TABLE generation_attempt ADD COLUMN worker_execution_id VARCHAR(160);

ALTER TABLE inbox_event ADD COLUMN job_id UUID REFERENCES generation_job(id);
ALTER TABLE inbox_event ADD COLUMN attempt_id UUID REFERENCES generation_attempt(id);
ALTER TABLE inbox_event ADD COLUMN disposition VARCHAR(60);
ALTER TABLE inbox_event ADD COLUMN detail VARCHAR(1000);
ALTER TABLE inbox_event ADD COLUMN duplicate_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE inbox_event ADD COLUMN last_received_at TIMESTAMPTZ NOT NULL DEFAULT now();
