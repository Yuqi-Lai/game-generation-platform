CREATE TABLE app_user (
    id UUID PRIMARY KEY,
    auth_issuer VARCHAR(512) NOT NULL,
    auth_subject VARCHAR(255) NOT NULL,
    email VARCHAR(320),
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    display_name VARCHAR(200),
    status VARCHAR(30) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT uq_app_user_external_identity UNIQUE (auth_issuer, auth_subject),
    CONSTRAINT ck_app_user_status CHECK (status IN ('ACTIVE', 'DISABLED'))
);

CREATE TABLE access_invitation (
    id UUID PRIMARY KEY,
    email_normalized VARCHAR(320) NOT NULL,
    status VARCHAR(30) NOT NULL,
    accepted_by_user_id UUID REFERENCES app_user(id),
    note VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_access_invitation_status CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED'))
);

CREATE UNIQUE INDEX uq_access_invitation_pending_email
    ON access_invitation (email_normalized)
    WHERE status = 'PENDING';

CREATE TABLE project (
    id UUID PRIMARY KEY,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    status VARCHAR(30) NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    archived_at TIMESTAMPTZ,
    row_version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_project_status CHECK (status IN ('ACTIVE', 'ARCHIVED'))
);

CREATE TABLE project_membership (
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_user(id),
    role VARCHAR(30) NOT NULL,
    created_by_user_id UUID NOT NULL REFERENCES app_user(id),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    row_version BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, user_id),
    CONSTRAINT ck_project_membership_role CHECK (role IN ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER'))
);

CREATE INDEX idx_project_membership_user_project
    ON project_membership (user_id, project_id);

CREATE INDEX idx_project_membership_project_role
    ON project_membership (project_id, role);

