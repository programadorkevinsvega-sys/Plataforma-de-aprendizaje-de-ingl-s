\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE phase24_session_ids (
    user_one UUID NOT NULL,
    user_two UUID NOT NULL,
    course_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    unit_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    objective_id UUID NOT NULL,
    enrollment_id UUID NOT NULL,
    activity_id UUID NOT NULL,
    activity_version INTEGER NOT NULL,
    session_id UUID NOT NULL,
    start_key UUID NOT NULL,
    reservation_id UUID NOT NULL,
    idempotency_key UUID NOT NULL,
    assessment_attempt_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO phase24_session_ids
SELECT uuid_generate_v4(), uuid_generate_v4(), uuid_generate_v4(),
       uuid_generate_v4(), uuid_generate_v4(), uuid_generate_v4(),
       uuid_generate_v4(), uuid_generate_v4(), uuid_generate_v4(), 1,
       uuid_generate_v4(), uuid_generate_v4(), uuid_generate_v4(),
       uuid_generate_v4(), uuid_generate_v4();

INSERT INTO users (id, email, password_hash, full_name)
SELECT user_one, 'phase24-' || user_one::TEXT || '@example.invalid', 'test-only', 'Phase 2.4 Student One'
  FROM phase24_session_ids;
INSERT INTO users (id, email, password_hash, full_name)
SELECT user_two, 'phase24-' || user_two::TEXT || '@example.invalid', 'test-only', 'Phase 2.4 Student Two'
  FROM phase24_session_ids;

INSERT INTO courses (id, slug, track_code)
SELECT course_id, 'phase24-session-' || left(course_id::TEXT, 8), 'general'
  FROM phase24_session_ids;
INSERT INTO course_versions (
    id, course_id, version_number, status, cefr_level, title, description,
    locale, content_schema_version, published_at
)
SELECT course_version_id, course_id, 1, 'published', 'A1', 'Phase 2.4 session test',
       'Test-only session fixture', 'en', 1, CURRENT_TIMESTAMP
  FROM phase24_session_ids;
INSERT INTO course_units (id, course_version_id, unit_code, position, title, theme, description)
SELECT unit_id, course_version_id, 'unit-1', 1, 'Test unit', 'Test theme', ''
  FROM phase24_session_ids;
INSERT INTO course_lessons (
    id, course_version_id, unit_id, lesson_code, position, lesson_pattern, title, description
)
SELECT lesson_id, course_version_id, unit_id, 'lesson-1', 1, 'practice', 'Test lesson', ''
  FROM phase24_session_ids;
INSERT INTO learning_objectives (
    id, course_version_id, objective_code, description, success_criteria, position
)
SELECT objective_id, course_version_id, 'objective-1', 'Complete a test activity',
       'Submit a valid response', 1
  FROM phase24_session_ids;
INSERT INTO lesson_learning_objectives (
    course_version_id, lesson_id, learning_objective_id, position, is_required
)
SELECT course_version_id, lesson_id, objective_id, 1, TRUE
  FROM phase24_session_ids;
INSERT INTO course_enrollments (id, user_id, course_version_id, status)
SELECT enrollment_id, user_one, course_version_id, 'active'
  FROM phase24_session_ids;

INSERT INTO curriculum_lesson_activities (
    activity_id, course_version_id, lesson_id, activity_code, activity_version,
    position, definition_json, definition_sha256
)
SELECT activity_id, course_version_id, lesson_id, 'phase24-test-activity', activity_version,
       1,
       jsonb_build_object(
           'activityId', activity_id::TEXT,
           'activityCode', 'phase24-test-activity',
           'activityVersion', activity_version,
           'courseVersionId', course_version_id::TEXT,
           'lessonId', lesson_id::TEXT
       ),
       repeat('a', 64)
  FROM phase24_session_ids;

INSERT INTO lesson_activity_objectives (
    activity_id, course_version_id, lesson_id, learning_objective_id, position
)
SELECT activity_id, course_version_id, lesson_id, objective_id, 1
  FROM phase24_session_ids;

INSERT INTO lesson_sessions (
    id, user_id, enrollment_id, course_version_id, lesson_id,
    start_idempotency_key, status, current_activity_position, total_activity_count
)
SELECT session_id, user_one, enrollment_id, course_version_id, lesson_id,
       start_key, 'in_progress', 1, 1
  FROM phase24_session_ids;

INSERT INTO activity_attempt_results (
    attempt_id, user_id, activity_id, activity_version, idempotency_key,
    activity_definition_json, submission_json, result_json, evaluation_engine_version
)
SELECT assessment_attempt_id, user_one, activity_id, activity_version,
       uuid_generate_v4(),
       '{"schemaVersion":"1.0"}'::JSONB,
       '{"schemaVersion":"1.0"}'::JSONB,
       '{"state":"evaluated"}'::JSONB,
       'phase2-4-sql-assertion'
  FROM phase24_session_ids;

INSERT INTO lesson_session_activity_attempts (
    reservation_id, session_id, user_id, course_version_id, lesson_id,
    activity_id, activity_version, attempt_number, idempotency_key, submission_json
)
SELECT reservation_id, session_id, user_one, course_version_id, lesson_id,
       activity_id, activity_version, 1, idempotency_key,
       '{"schemaVersion":"1.0"}'::JSONB
  FROM phase24_session_ids;

DO $$
DECLARE
    table_name TEXT;
    rls_enabled BOOLEAN;
    rls_forced BOOLEAN;
    required_policy_count INTEGER;
    user_one UUID;
    activity_id UUID;
    course_version_id UUID;
    lesson_id UUID;
    session_id UUID;
    reservation_id UUID;
    assessment_attempt_id UUID;
    v_user_one UUID;
    v_activity_id UUID;
    v_course_version_id UUID;
    v_lesson_id UUID;
    v_session_id UUID;
    v_reservation_id UUID;
    v_assessment_attempt_id UUID;
    v_objective_id UUID;
BEGIN
    SELECT ids.user_one, ids.activity_id, ids.course_version_id, ids.lesson_id,
           ids.session_id, ids.reservation_id, ids.assessment_attempt_id, ids.objective_id
      INTO v_user_one, v_activity_id, v_course_version_id, v_lesson_id,
           v_session_id, v_reservation_id, v_assessment_attempt_id, v_objective_id
      FROM phase24_session_ids ids;

    FOREACH table_name IN ARRAY ARRAY[
        'curriculum_lesson_activities',
        'lesson_activity_objectives',
        'lesson_sessions',
        'lesson_session_activity_attempts',
        'activity_objective_evidence',
        'lesson_completion_reward_events'
    ] LOOP
        SELECT relation.relrowsecurity, relation.relforcerowsecurity
          INTO rls_enabled, rls_forced
          FROM pg_class relation
          JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
         WHERE namespace.nspname = current_schema()
           AND relation.relname = table_name;
        IF NOT COALESCE(rls_enabled, FALSE) OR NOT COALESCE(rls_forced, FALSE) THEN
            RAISE EXCEPTION 'RLS must be enabled and forced on %', table_name;
        END IF;
    END LOOP;

    SELECT COUNT(*) INTO required_policy_count
      FROM pg_policies
     WHERE schemaname = current_schema()
       AND (tablename, policyname) IN (
           ('curriculum_lesson_activities', 'lesson_activities_enrolled_private_read'),
           ('curriculum_lesson_activities', 'lesson_activities_editor_insert'),
           ('lesson_activity_objectives', 'lesson_activity_objectives_enrolled_read'),
           ('lesson_activity_objectives', 'lesson_activity_objectives_editor_insert'),
           ('lesson_sessions', 'lesson_sessions_select_own'),
           ('lesson_sessions', 'lesson_sessions_insert_own'),
           ('lesson_sessions', 'lesson_sessions_update_own'),
           ('lesson_session_activity_attempts', 'lesson_session_attempts_select_own'),
           ('lesson_session_activity_attempts', 'lesson_session_attempts_insert_own'),
           ('lesson_session_activity_attempts', 'lesson_session_attempts_update_own'),
           ('activity_objective_evidence', 'activity_objective_evidence_select_own'),
           ('activity_objective_evidence', 'activity_objective_evidence_insert_own'),
           ('lesson_completion_reward_events', 'lesson_completion_reward_events_select_own'),
           ('lesson_completion_reward_events', 'lesson_completion_reward_events_insert_own')
       );
    IF required_policy_count <> 14 THEN
        RAISE EXCEPTION 'Expected all 14 lesson activity/session RLS policies, found %', required_policy_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname = 'uq_lesson_sessions_one_active_per_user_lesson'
           AND indexdef ILIKE '%pending_review%'
    ) THEN
        RAISE EXCEPTION 'Only one in-progress or pending-review session is allowed per student and lesson';
    END IF;

    -- Published private definitions cannot be mutated in place.
    BEGIN
        UPDATE curriculum_lesson_activities AS activity
           SET definition_sha256 = repeat('b', 64)
         WHERE activity.activity_id = v_activity_id;
        RAISE EXCEPTION 'published activity definition update was accepted';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    -- A corrupted client cannot skip activity positions or move the cursor backwards.
    BEGIN
        UPDATE lesson_sessions
           SET current_activity_position = 3
         WHERE id = v_session_id;
        RAISE EXCEPTION 'lesson session accepted a cursor jump';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    -- Reserve -> final is permitted once; a final attempt is immutable.
    UPDATE lesson_session_activity_attempts
       SET state = 'evaluated',
           result_json = '{"state":"evaluated"}'::JSONB,
           assessment_attempt_id = v_assessment_attempt_id,
           completed_at = CURRENT_TIMESTAMP
     WHERE reservation_id = v_reservation_id;

    BEGIN
        UPDATE lesson_session_activity_attempts AS attempt
           SET result_json = '{"state":"changed"}'::JSONB
         WHERE attempt.reservation_id = v_reservation_id;
        RAISE EXCEPTION 'final lesson activity attempt could be modified';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO activity_objective_evidence (
        user_id, session_id, assessment_attempt_id, activity_id, course_version_id,
        lesson_id, learning_objective_id, normalized_score
    ) VALUES (
        v_user_one, v_session_id, v_assessment_attempt_id, v_activity_id, v_course_version_id,
        v_lesson_id, v_objective_id, 0.95
    );

    BEGIN
        UPDATE activity_objective_evidence AS evidence
           SET normalized_score = 0.1
         WHERE evidence.assessment_attempt_id = v_assessment_attempt_id;
        RAISE EXCEPTION 'objective evidence is mutable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;

    INSERT INTO lesson_completion_reward_events (
        user_id, lesson_id, course_version_id, source_session_id
    ) VALUES (
        v_user_one, v_lesson_id, v_course_version_id, v_session_id
    );
    BEGIN
        UPDATE lesson_completion_reward_events
           SET xp_amount = 21
         WHERE source_session_id = v_session_id;
        RAISE EXCEPTION 'lesson completion reward event is mutable';
    EXCEPTION WHEN SQLSTATE '55000' THEN NULL;
    END;
END
$;

-- Verify that a non-owner role sees only its own session, even with FORCE RLS.
CREATE ROLE phase24_rls_probe NOLOGIN NOSUPERUSER NOBYPASSRLS;
GRANT USAGE ON SCHEMA public TO phase24_rls_probe;
DO $$
DECLARE
    temp_schema_name TEXT;
BEGIN
    SELECT nspname INTO temp_schema_name
      FROM pg_namespace
     WHERE oid = pg_my_temp_schema();
    IF temp_schema_name IS NULL THEN
        RAISE EXCEPTION 'temporary schema not initialized for phase 2.4 RLS probe';
    END IF;
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO phase24_rls_probe', temp_schema_name);
END
$$;
GRANT SELECT, INSERT, UPDATE ON lesson_sessions TO phase24_rls_probe;
GRANT SELECT ON phase24_session_ids TO phase24_rls_probe;
SET LOCAL ROLE phase24_rls_probe;
SELECT set_config(
    'app.current_user_id',
    (SELECT user_one::TEXT FROM phase24_session_ids),
    TRUE
);

DO $$
DECLARE
    visible_count INTEGER;
    other_user UUID;
    new_session_id UUID := uuid_generate_v4();
BEGIN
    SELECT user_two INTO other_user FROM phase24_session_ids;
    SELECT COUNT(*) INTO visible_count
      FROM lesson_sessions
     WHERE user_id = (SELECT user_one FROM phase24_session_ids);
    IF visible_count <> 1 THEN
        RAISE EXCEPTION 'RLS should expose the current learner own session';
    END IF;

    SELECT COUNT(*) INTO visible_count
      FROM lesson_sessions
     WHERE user_id = other_user;
    IF visible_count <> 0 THEN
        RAISE EXCEPTION 'RLS exposed another learner session';
    END IF;

    BEGIN
        INSERT INTO lesson_sessions (
            id, user_id, enrollment_id, course_version_id, lesson_id,
            start_idempotency_key, total_activity_count
        )
        SELECT new_session_id, other_user, enrollment_id, course_version_id, lesson_id,
               uuid_generate_v4(), 1
          FROM phase24_session_ids;
        RAISE EXCEPTION 'RLS accepted a lesson session for another learner';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END
$$;

ROLLBACK;
