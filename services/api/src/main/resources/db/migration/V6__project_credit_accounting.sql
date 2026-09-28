ALTER TABLE generation_job
    ADD COLUMN credit_cost BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT ck_generation_job_credit_cost CHECK (credit_cost >= 0);

CREATE TABLE project_credit_account (
    project_id UUID PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
    total_granted BIGINT NOT NULL,
    reserved BIGINT NOT NULL,
    consumed BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_credit_account_non_negative CHECK (
        total_granted >= 0 AND reserved >= 0 AND consumed >= 0
    ),
    CONSTRAINT ck_credit_account_not_overspent CHECK (
        reserved + consumed <= total_granted
    )
);

CREATE TABLE credit_ledger (
    id UUID PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    generation_job_id UUID REFERENCES generation_job(id),
    amount BIGINT NOT NULL,
    movement_type VARCHAR(30) NOT NULL,
    idempotency_key VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT ck_credit_ledger_amount CHECK (amount > 0),
    CONSTRAINT ck_credit_ledger_type CHECK (
        movement_type IN ('GRANT', 'RESERVE', 'CAPTURE', 'RELEASE')
    ),
    CONSTRAINT uq_credit_ledger_idempotency UNIQUE (idempotency_key)
);

CREATE UNIQUE INDEX uq_credit_ledger_job_reserve
    ON credit_ledger (generation_job_id)
    WHERE movement_type = 'RESERVE';

CREATE UNIQUE INDEX uq_credit_ledger_job_terminal
    ON credit_ledger (generation_job_id)
    WHERE movement_type IN ('CAPTURE', 'RELEASE');

CREATE INDEX idx_credit_ledger_project_created
    ON credit_ledger (project_id, created_at DESC);

CREATE FUNCTION prevent_credit_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'credit_ledger is append-only';
END;
$$;

CREATE TRIGGER credit_ledger_append_only
    BEFORE UPDATE OR DELETE ON credit_ledger
    FOR EACH ROW EXECUTE FUNCTION prevent_credit_ledger_mutation();

INSERT INTO project_credit_account (project_id, total_granted, reserved, consumed, updated_at)
SELECT id, 100, 0, 0, now()
FROM project;

INSERT INTO credit_ledger (
    id, project_id, generation_job_id, amount, movement_type, idempotency_key, created_at
)
SELECT gen_random_uuid(), id, NULL, 100, 'GRANT', 'project:' || id || ':initial-grant:v1', now()
FROM project;
