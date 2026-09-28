ALTER TABLE content_version DROP CONSTRAINT ck_content_version_status;
ALTER TABLE content_version ADD CONSTRAINT ck_content_version_status CHECK (status IN (
    'DRAFT', 'IN_REVIEW', 'APPROVED', 'CHANGES_REQUESTED', 'SUPERSEDED'
));

CREATE TABLE review_request (
    id UUID PRIMARY KEY,
    content_version_id UUID NOT NULL REFERENCES content_version(id),
    request_number INTEGER NOT NULL,
    requested_by_user_id UUID NOT NULL REFERENCES app_user(id),
    submit_idempotency_key UUID NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_review_request_number UNIQUE (content_version_id, request_number),
    CONSTRAINT uq_review_request_command UNIQUE (content_version_id, submit_idempotency_key),
    CONSTRAINT uq_review_request_id_version UNIQUE (id, content_version_id),
    CONSTRAINT ck_review_request_status CHECK (status IN (
        'OPEN', 'APPROVED', 'CHANGES_REQUESTED', 'SUPERSEDED'
    ))
);

CREATE UNIQUE INDEX uq_review_request_open_version
    ON review_request (content_version_id) WHERE status = 'OPEN';

CREATE TABLE review_assignment (
    id UUID PRIMARY KEY,
    review_request_id UUID NOT NULL,
    content_version_id UUID NOT NULL,
    reviewer_user_id UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_review_assignment_request_version
        FOREIGN KEY (review_request_id, content_version_id)
        REFERENCES review_request(id, content_version_id) ON DELETE CASCADE,
    CONSTRAINT uq_review_assignment_reviewer UNIQUE (review_request_id, reviewer_user_id)
);

CREATE TABLE review_decision (
    id UUID PRIMARY KEY,
    review_assignment_id UUID NOT NULL REFERENCES review_assignment(id) ON DELETE CASCADE,
    review_request_id UUID NOT NULL,
    content_version_id UUID NOT NULL,
    reviewer_user_id UUID NOT NULL REFERENCES app_user(id),
    decision VARCHAR(30) NOT NULL,
    comment TEXT,
    request_idempotency_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    decided_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fk_review_decision_request_version
        FOREIGN KEY (review_request_id, content_version_id)
        REFERENCES review_request(id, content_version_id),
    CONSTRAINT uq_review_decision_assignment UNIQUE (review_assignment_id),
    CONSTRAINT uq_review_decision_command UNIQUE (reviewer_user_id, request_idempotency_key),
    CONSTRAINT ck_review_decision CHECK (decision IN ('APPROVE', 'REQUEST_CHANGES'))
);

CREATE INDEX idx_content_version_project_version
    ON content_version (project_id, version_number DESC);
CREATE INDEX idx_review_request_version_created
    ON review_request (content_version_id, created_at DESC);
CREATE INDEX idx_review_assignment_reviewer
    ON review_assignment (reviewer_user_id, review_request_id);
CREATE INDEX idx_review_decision_request
    ON review_decision (review_request_id, created_at);
