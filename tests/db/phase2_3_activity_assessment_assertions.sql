\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE phase23_assessment_ids (
    user_one UUID NOT NULL,
    user_two UUID NOT NULL,
    activity_id UUID NOT NULL,
    idempotency UUID NOT NULL,
    probe_attempt UUID NOT NULL,
    probe_idempotency UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO phase23_assessment_ids
VALUES (
    uuid_generate_v4(), uuid_generate_v4(), uuid_generate_v4(),
    uuid_generate_v4(), uuid_generate_v4(), uuid_generate_v4()
);

DO $$
DECLARE
    user_one UUID;
    user_two UUID;
    activity_id UUID;
    attempt_one UUID := uuid_generate_v4();
    attempt_two UUID := uuid_generate_v4();
    idempotency UUID;
    attempt_count INTEGER;
    row_security_enabled BOOLEAN;
    row_security_forced BOOLEAN;
    update_policy_count INTEGER;
    delete_policy_count INTEGER;
BEGIN
    SELECT ids.user_one, ids.user_two, ids.activity_id, ids.idempotency
    INTO user_one, user_two, activity_id, idempotency
    FROM phase23_assessment_ids ids;

    INSERT INTO users (id, email, password_hash, full_name)
    VALUES
        (user_one, 'phase23-' || user_one::TEXT || '@example.invalid', 'test-only', 'Phase 2.3 Test One'),
        (user_two, 'phase23-' || user_two::TEXT || '@example.invalid', 'test-only', 'Phase 2.3 Test Two');

    INSERT INTO activity_attempt_results (
        attempt_id, user_id, activity_id, activity_version, idempotency_key,
        activity_definition_json, submission_json, result_json,
        evaluation_engine_version, rubric_code, rubric_version
    ) VALUES (
        attempt_one, user_one, activity_id, 1, idempotency,
        '{"schemaVersion":"1.0"}'::JSONB,
        '{"schemaVersion":"1.0"}'::JSONB,
        '{"state":"evaluated"}'::JSONB,
        'activity-evaluation-v1', 'writing-a1', 1
    );

    -- The same student's retry cannot create a second persisted result.
    BEGIN
        INSERT INTO activity_attempt_results (
            attempt_id, user_id, activity_id, activity_version, idempotency_key,
            activity_definition_json, submission_json, result_json,
            evaluation_engine_version
        ) VALUES (
            uuid_generate_v4(), user_one, activity_id, 1, idempotency,
            '{"schemaVersion":"1.0"}'::JSONB,
            '{"schemaVersion":"1.0"}'::JSONB,
            '{"state":"evaluated"}'::JSONB,
            'activity-evaluation-v1'
        );
        RAISE EXCEPTION 'duplicate user-scoped idempotency key was accepted';
    EXCEPTION
        WHEN unique_violation THEN NULL;
    END;

    -- Idempotency is scoped to the authenticated user, not global.
    INSERT INTO activity_attempt_results (
        attempt_id, user_id, activity_id, activity_version, idempotency_key,
        activity_definition_json, submission_json, result_json,
        evaluation_engine_version
    ) VALUES (
        attempt_two, user_two, activity_id, 1, idempotency,
        '{"schemaVersion":"1.0"}'::JSONB,
        '{"schemaVersion":"1.0"}'::JSONB,
        '{"state":"evaluated"}'::JSONB,
        'activity-evaluation-v1'
    );

    SELECT count(*) INTO attempt_count
    FROM activity_attempt_results
    WHERE user_id = user_one AND idempotency_key = idempotency;
    IF attempt_count <> 1 THEN
        RAISE EXCEPTION 'expected exactly one assessment record for a user retry';
    END IF;

    SELECT count(*) INTO attempt_count
    FROM activity_attempt_results
    WHERE user_id = user_two AND idempotency_key = idempotency;
    IF attempt_count <> 1 THEN
        RAISE EXCEPTION 'idempotency key should be scoped by user';
    END IF;

    SELECT c.relrowsecurity, c.relforcerowsecurity
    INTO row_security_enabled, row_security_forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname = 'activity_attempt_results';

    IF NOT COALESCE(row_security_enabled, FALSE)
       OR NOT COALESCE(row_security_forced, FALSE) THEN
        RAISE EXCEPTION 'assessment results must enable and force PostgreSQL RLS';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'activity_attempt_results'
          AND policyname = 'activity_attempt_results_read_own'
          AND cmd = 'SELECT'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = current_schema()
          AND tablename = 'activity_attempt_results'
          AND policyname = 'activity_attempt_results_insert_own'
          AND cmd = 'INSERT'
    ) THEN
        RAISE EXCEPTION 'assessment results must have owner-scoped SELECT and INSERT policies';
    END IF;

    -- A rubric code without a rubric version must be rejected by the table check.
    BEGIN
        INSERT INTO activity_attempt_results (
            attempt_id, user_id, activity_id, activity_version, idempotency_key,
            activity_definition_json, submission_json, result_json,
            evaluation_engine_version, rubric_code, rubric_version
        ) VALUES (
            uuid_generate_v4(), user_one, activity_id, 1, uuid_generate_v4(),
            '{"schemaVersion":"1.0"}'::JSONB,
            '{"schemaVersion":"1.0"}'::JSONB,
            '{"state":"evaluated"}'::JSONB,
            'activity-evaluation-v1', 'writing-a1', NULL
        );
        RAISE EXCEPTION 'rubric code without a version was accepted';
    EXCEPTION
        WHEN check_violation THEN NULL;
    END;

    SELECT count(*) INTO update_policy_count
    FROM pg_policies
    WHERE schemaname = current_schema()
      AND tablename = 'activity_attempt_results'
      AND cmd = 'UPDATE';
    SELECT count(*) INTO delete_policy_count
    FROM pg_policies
    WHERE schemaname = current_schema()
      AND tablename = 'activity_attempt_results'
      AND cmd = 'DELETE';

    IF update_policy_count <> 0 OR delete_policy_count <> 0 THEN
        RAISE EXCEPTION 'assessment results must not expose UPDATE or DELETE policies';
    END IF;
END
$$;

-- Also exercise real SELECT/INSERT isolation as a non-owner, non-bypass role.
CREATE ROLE phase23_rls_probe NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO phase23_rls_probe;
GRANT USAGE ON SCHEMA pg_temp TO phase23_rls_probe;
GRANT SELECT ON phase23_assessment_ids TO phase23_rls_probe;
GRANT SELECT, INSERT ON activity_attempt_results TO phase23_rls_probe;
SET LOCAL ROLE phase23_rls_probe;

SELECT set_config(
    'app.current_user_id',
    (SELECT user_one::TEXT FROM phase23_assessment_ids),
    TRUE
);

DO $$
DECLARE
    visible_rows INTEGER;
    other_user UUID;
    activity_id UUID;
    probe_attempt UUID;
    probe_idempotency UUID;
BEGIN
    SELECT user_two, activity_id, probe_attempt, probe_idempotency
    INTO other_user, activity_id, probe_attempt, probe_idempotency
    FROM phase23_assessment_ids;

    SELECT count(*) INTO visible_rows
    FROM activity_attempt_results
    WHERE user_id = (SELECT user_one FROM phase23_assessment_ids);
    IF visible_rows <> 1 THEN
        RAISE EXCEPTION 'RLS did not expose the current user own attempt';
    END IF;

    SELECT count(*) INTO visible_rows
    FROM activity_attempt_results
    WHERE user_id = other_user;
    IF visible_rows <> 0 THEN
        RAISE EXCEPTION 'RLS exposed another user assessment result';
    END IF;

    BEGIN
        INSERT INTO activity_attempt_results (
            attempt_id, user_id, activity_id, activity_version, idempotency_key,
            activity_definition_json, submission_json, result_json,
            evaluation_engine_version
        ) VALUES (
            probe_attempt, other_user, activity_id, 1, probe_idempotency,
            '{"schemaVersion":"1.0"}'::JSONB,
            '{"schemaVersion":"1.0"}'::JSONB,
            '{"state":"evaluated"}'::JSONB,
            'activity-evaluation-v1'
        );
        RAISE EXCEPTION 'RLS accepted an insert for another user';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$$;

ROLLBACK;
