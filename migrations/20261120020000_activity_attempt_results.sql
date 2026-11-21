-- Phase 2.3: immutable assessment evidence and user-scoped idempotency.
-- Private definitions and answer submissions are stored only in the evaluator service.
CREATE TABLE IF NOT EXISTS activity_attempt_results (
    attempt_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id UUID NOT NULL,
    activity_version BIGINT NOT NULL CHECK (activity_version > 0),
    idempotency_key UUID NOT NULL,
    activity_definition_json JSONB NOT NULL
        CHECK (jsonb_typeof(activity_definition_json) = 'object'),
    submission_json JSONB NOT NULL
        CHECK (jsonb_typeof(submission_json) = 'object'),
    result_json JSONB NOT NULL
        CHECK (jsonb_typeof(result_json) = 'object'),
    evaluation_engine_version VARCHAR(64) NOT NULL
        CHECK (length(btrim(evaluation_engine_version)) > 0),
    rubric_code VARCHAR(80),
    rubric_version BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_activity_attempt_identifiers_non_nil CHECK (
        attempt_id <> '00000000-0000-0000-0000-000000000000'::UUID
        AND user_id <> '00000000-0000-0000-0000-000000000000'::UUID
        AND activity_id <> '00000000-0000-0000-0000-000000000000'::UUID
        AND idempotency_key <> '00000000-0000-0000-0000-000000000000'::UUID
    ),
    CONSTRAINT uq_activity_attempt_user_idempotency
        UNIQUE (user_id, idempotency_key),
    CONSTRAINT ck_activity_attempt_rubric_version CHECK (
        (rubric_code IS NULL AND rubric_version IS NULL)
        OR
        (rubric_code IS NOT NULL AND length(btrim(rubric_code)) > 0
            AND rubric_version IS NOT NULL AND rubric_version > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_activity_attempt_user_activity_created
    ON activity_attempt_results(user_id, activity_id, created_at DESC);

-- Each student may see and insert only their own attempt evidence. The table
-- has no UPDATE or DELETE policy: results are immutable once persisted.
ALTER TABLE activity_attempt_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_attempt_results FORCE ROW LEVEL SECURITY;

CREATE POLICY activity_attempt_results_read_own
    ON activity_attempt_results
    FOR SELECT
    USING (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);

CREATE POLICY activity_attempt_results_insert_own
    ON activity_attempt_results
    FOR INSERT
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);

COMMENT ON TABLE activity_attempt_results IS
    'Immutable assessment evidence with private versioned activity definition, answer submission, result, and user-scoped idempotency.';
COMMENT ON COLUMN activity_attempt_results.activity_definition_json IS
    'Private canonical definition; never return this JSON to the student-facing API.';
COMMENT ON COLUMN activity_attempt_results.evaluation_engine_version IS
    'Version of deterministic and rubric evaluation code used to produce the result.';
COMMENT ON COLUMN activity_attempt_results.idempotency_key IS
    'One key per user; retries return the first committed result without a second assessment record.';
