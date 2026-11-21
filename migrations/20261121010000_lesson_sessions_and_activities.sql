-- Phase 2.4: immutable published activity definitions and recoverable lesson sessions.
-- Student-facing APIs receive only StudentActivityView. Answer keys and rubrics stay private.
CREATE TABLE IF NOT EXISTS curriculum_lesson_activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    activity_code VARCHAR(80) NOT NULL CHECK (length(btrim(activity_code)) > 0),
    activity_version INTEGER NOT NULL CHECK (activity_version > 0),
    position INTEGER NOT NULL CHECK (position > 0),
    definition_json JSONB NOT NULL CHECK (jsonb_typeof(definition_json) = 'object'),
    definition_sha256 CHAR(64) NOT NULL CHECK (definition_sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_lesson_activity_version UNIQUE (activity_id, activity_version),
    CONSTRAINT uq_lesson_activity_code_version UNIQUE (lesson_id, activity_code, activity_version),
    CONSTRAINT uq_lesson_activity_position UNIQUE (lesson_id, position),
    CONSTRAINT uq_lesson_activity_id_course UNIQUE (activity_id, course_version_id),
    CONSTRAINT uq_lesson_activity_full_identity UNIQUE (activity_id, course_version_id, lesson_id),
    CONSTRAINT fk_lesson_activity_lesson_version
        FOREIGN KEY (lesson_id, course_version_id)
        REFERENCES course_lessons(id, course_version_id) ON DELETE RESTRICT,
    CONSTRAINT ck_lesson_activity_definition_identity CHECK (
        definition_json->>'activityId' = activity_id::TEXT
        AND definition_json->>'activityCode' = activity_code
        AND (definition_json->>'activityVersion')::INTEGER = activity_version
        AND definition_json->>'courseVersionId' = course_version_id::TEXT
        AND definition_json->>'lessonId' = lesson_id::TEXT
    )
);

CREATE INDEX IF NOT EXISTS idx_lesson_activities_order
    ON curriculum_lesson_activities(course_version_id, lesson_id, position);

CREATE TABLE IF NOT EXISTS lesson_activity_objectives (
    activity_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    learning_objective_id UUID NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    PRIMARY KEY (activity_id, learning_objective_id),
    CONSTRAINT uq_lesson_activity_objective_position UNIQUE (activity_id, position),
    CONSTRAINT uq_lesson_activity_objective_full_identity
        UNIQUE (activity_id, course_version_id, lesson_id, learning_objective_id),
    FOREIGN KEY (lesson_id, learning_objective_id)
        REFERENCES lesson_learning_objectives(lesson_id, learning_objective_id) ON DELETE RESTRICT,
    FOREIGN KEY (activity_id, course_version_id, lesson_id)
        REFERENCES curriculum_lesson_activities(activity_id, course_version_id, lesson_id) ON DELETE RESTRICT,
    FOREIGN KEY (learning_objective_id, course_version_id)
        REFERENCES learning_objectives(id, course_version_id) ON DELETE RESTRICT
);

-- Extend enrollment and session identity keys so a session cannot reference
-- a different course version's enrollment, lesson, or activity.
ALTER TABLE course_enrollments
    ADD CONSTRAINT uq_course_enrollment_id_user_version
    UNIQUE (id, user_id, course_version_id);

CREATE TABLE IF NOT EXISTS lesson_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    start_idempotency_key UUID NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'pending_review', 'abandoned')),
    current_activity_position INTEGER NOT NULL DEFAULT 1 CHECK (current_activity_position > 0),
    total_activity_count INTEGER NOT NULL CHECK (total_activity_count > 0),
    active_duration_ms BIGINT NOT NULL DEFAULT 0
        CHECK (active_duration_ms BETWEEN 0 AND 43200000),
    current_activity_started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_lesson_session_user_start_key UNIQUE (user_id, start_idempotency_key),
    CONSTRAINT uq_lesson_session_id_user UNIQUE (id, user_id),
    CONSTRAINT uq_lesson_session_full_identity UNIQUE (id, user_id, lesson_id, course_version_id),
    CONSTRAINT fk_lesson_session_enrollment_user_version
        FOREIGN KEY (enrollment_id, user_id, course_version_id)
        REFERENCES course_enrollments(id, user_id, course_version_id) ON DELETE CASCADE,
    CONSTRAINT fk_lesson_session_lesson_version
        FOREIGN KEY (lesson_id, course_version_id)
        REFERENCES course_lessons(id, course_version_id) ON DELETE RESTRICT,
    CONSTRAINT ck_lesson_session_completion CHECK (
        (status IN ('completed', 'pending_review') AND completed_at IS NOT NULL)
        OR (status IN ('in_progress', 'abandoned') AND completed_at IS NULL)
    ),
    CONSTRAINT ck_lesson_session_position CHECK (
        current_activity_position <= total_activity_count + 1
    ),
    CONSTRAINT ck_lesson_session_identifiers CHECK (
        user_id <> '00000000-0000-0000-0000-000000000000'::UUID
        AND start_idempotency_key <> '00000000-0000-0000-0000-000000000000'::UUID
    )
);

CREATE INDEX IF NOT EXISTS idx_lesson_sessions_user_recent
    ON lesson_sessions(user_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_sessions_lesson_status
    ON lesson_sessions(user_id, lesson_id, status, last_activity_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_sessions_one_active_per_user_lesson
    ON lesson_sessions(user_id, lesson_id) WHERE status IN ('in_progress', 'pending_review');

CREATE TABLE IF NOT EXISTS lesson_session_activity_attempts (
    reservation_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL,
    user_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    activity_id UUID NOT NULL,
    activity_version INTEGER NOT NULL CHECK (activity_version > 0),
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    idempotency_key UUID NOT NULL,
    submission_json JSONB NOT NULL CHECK (jsonb_typeof(submission_json) = 'object'),
    result_json JSONB CHECK (result_json IS NULL OR jsonb_typeof(result_json) = 'object'),
    assessment_attempt_id UUID,
    state VARCHAR(16) NOT NULL DEFAULT 'processing'
        CHECK (state IN ('processing', 'evaluated', 'pending_review', 'not_measured')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    CONSTRAINT uq_lesson_session_attempt_number UNIQUE (session_id, activity_id, attempt_number),
    CONSTRAINT uq_lesson_session_attempt_user_key UNIQUE (user_id, idempotency_key),
    CONSTRAINT uq_lesson_session_attempt_reservation_user UNIQUE (reservation_id, user_id),
    FOREIGN KEY (session_id, user_id, lesson_id, course_version_id)
        REFERENCES lesson_sessions(id, user_id, lesson_id, course_version_id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id, course_version_id, lesson_id)
        REFERENCES curriculum_lesson_activities(activity_id, course_version_id, lesson_id) ON DELETE RESTRICT,
    CONSTRAINT ck_session_attempt_result_state CHECK (
        (state = 'processing' AND result_json IS NULL AND assessment_attempt_id IS NULL AND completed_at IS NULL)
        OR
        (state <> 'processing' AND result_json IS NOT NULL AND assessment_attempt_id IS NOT NULL AND completed_at IS NOT NULL)
    ),
    CONSTRAINT ck_session_attempt_idempotency CHECK (
        idempotency_key <> '00000000-0000-0000-0000-000000000000'::UUID
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lesson_session_one_processing_attempt
    ON lesson_session_activity_attempts(session_id, activity_id)
    WHERE state = 'processing';
CREATE INDEX IF NOT EXISTS idx_lesson_session_attempts_recent
    ON lesson_session_activity_attempts(session_id, created_at, reservation_id);

CREATE TABLE IF NOT EXISTS activity_objective_evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    assessment_attempt_id UUID NOT NULL,
    activity_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    learning_objective_id UUID NOT NULL,
    normalized_score REAL NOT NULL CHECK (normalized_score BETWEEN 0 AND 1),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_activity_objective_attempt UNIQUE (user_id, assessment_attempt_id, learning_objective_id),
    FOREIGN KEY (session_id, user_id, lesson_id, course_version_id)
        REFERENCES lesson_sessions(id, user_id, lesson_id, course_version_id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id, course_version_id, lesson_id, learning_objective_id)
        REFERENCES lesson_activity_objectives(activity_id, course_version_id, lesson_id, learning_objective_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_activity_objective_evidence_user_objective
    ON activity_objective_evidence(user_id, learning_objective_id, recorded_at DESC);

-- A lesson may grant its completion reward only once per learner, regardless of retries.
CREATE TABLE IF NOT EXISTS lesson_completion_reward_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    source_session_id UUID NOT NULL,
    xp_amount INTEGER NOT NULL DEFAULT 20 CHECK (xp_amount = 20),
    coins_amount INTEGER NOT NULL DEFAULT 5 CHECK (coins_amount = 5),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_lesson_reward_user_lesson UNIQUE (user_id, lesson_id),
    CONSTRAINT uq_lesson_reward_user_session UNIQUE (user_id, source_session_id),
    FOREIGN KEY (source_session_id, user_id, lesson_id, course_version_id)
        REFERENCES lesson_sessions(id, user_id, lesson_id, course_version_id) ON DELETE CASCADE,
    FOREIGN KEY (lesson_id, course_version_id)
        REFERENCES course_lessons(id, course_version_id) ON DELETE RESTRICT
);

ALTER TABLE curriculum_lesson_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_lesson_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_activities_enrolled_private_read
    ON curriculum_lesson_activities FOR SELECT
    USING (
        app_is_content_editor()
        OR EXISTS (
            SELECT 1 FROM course_enrollments enrollment
             WHERE enrollment.course_version_id = curriculum_lesson_activities.course_version_id
               AND enrollment.user_id =
                   NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
               AND enrollment.status = 'active'
        )
    );
CREATE POLICY lesson_activities_editor_insert
    ON curriculum_lesson_activities FOR INSERT
    WITH CHECK (app_is_content_editor());

ALTER TABLE lesson_activity_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_activity_objectives FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_activity_objectives_enrolled_read
    ON lesson_activity_objectives FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM course_enrollments enrollment
             WHERE enrollment.course_version_id = lesson_activity_objectives.course_version_id
               AND enrollment.user_id =
                   NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
               AND enrollment.status = 'active'
        )
        OR app_is_content_editor()
    );
CREATE POLICY lesson_activity_objectives_editor_insert
    ON lesson_activity_objectives FOR INSERT WITH CHECK (app_is_content_editor());

ALTER TABLE lesson_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_sessions_select_own ON lesson_sessions
    FOR SELECT USING (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );
CREATE POLICY lesson_sessions_insert_own ON lesson_sessions
    FOR INSERT WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );
CREATE POLICY lesson_sessions_update_own ON lesson_sessions
    FOR UPDATE USING (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    ) WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );

ALTER TABLE lesson_session_activity_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_session_activity_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_session_attempts_select_own ON lesson_session_activity_attempts
    FOR SELECT USING (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );
CREATE POLICY lesson_session_attempts_insert_own ON lesson_session_activity_attempts
    FOR INSERT WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );
CREATE POLICY lesson_session_attempts_update_own ON lesson_session_activity_attempts
    FOR UPDATE USING (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    ) WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );

ALTER TABLE activity_objective_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_objective_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY activity_objective_evidence_select_own ON activity_objective_evidence
    FOR SELECT USING (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );
CREATE POLICY activity_objective_evidence_insert_own ON activity_objective_evidence
    FOR INSERT WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );

ALTER TABLE lesson_completion_reward_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_completion_reward_events FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_completion_reward_events_select_own ON lesson_completion_reward_events
    FOR SELECT USING (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );
CREATE POLICY lesson_completion_reward_events_insert_own ON lesson_completion_reward_events
    FOR INSERT WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );

CREATE OR REPLACE FUNCTION guard_curriculum_lesson_activity_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Published lesson activity definitions are immutable; create a new course version'
        USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER trg_curriculum_lesson_activity_immutable
    BEFORE UPDATE OR DELETE ON curriculum_lesson_activities
    FOR EACH ROW EXECUTE FUNCTION guard_curriculum_lesson_activity_immutable();

CREATE OR REPLACE FUNCTION guard_lesson_session_attempt_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $phase24_attempt$
BEGIN
    IF OLD.state <> 'processing' OR NEW.state = 'processing'
       OR NEW.reservation_id IS DISTINCT FROM OLD.reservation_id
       OR NEW.session_id IS DISTINCT FROM OLD.session_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.course_version_id IS DISTINCT FROM OLD.course_version_id
       OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
       OR NEW.activity_id IS DISTINCT FROM OLD.activity_id
       OR NEW.activity_version IS DISTINCT FROM OLD.activity_version
       OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.submission_json IS DISTINCT FROM OLD.submission_json
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'A reserved attempt may only transition once from processing to a final state'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$phase24_attempt$;
CREATE TRIGGER trg_lesson_session_attempt_transition
    BEFORE UPDATE ON lesson_session_activity_attempts
    FOR EACH ROW EXECUTE FUNCTION guard_lesson_session_attempt_transition();

CREATE OR REPLACE FUNCTION guard_lesson_session_state_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $phase24_session$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.enrollment_id IS DISTINCT FROM OLD.enrollment_id
       OR NEW.course_version_id IS DISTINCT FROM OLD.course_version_id
       OR NEW.lesson_id IS DISTINCT FROM OLD.lesson_id
       OR NEW.start_idempotency_key IS DISTINCT FROM OLD.start_idempotency_key
       OR NEW.total_activity_count IS DISTINCT FROM OLD.total_activity_count
       OR NEW.started_at IS DISTINCT FROM OLD.started_at THEN
        RAISE EXCEPTION 'Lesson session identity and activity count are immutable'
            USING ERRCODE = '55000';
    END IF;
    IF OLD.status <> 'in_progress' THEN
        RAISE EXCEPTION 'A finalized lesson session cannot transition again'
            USING ERRCODE = '55000';
    END IF;
    IF NEW.current_activity_position < OLD.current_activity_position
       OR NEW.current_activity_position > OLD.current_activity_position + 1 THEN
        RAISE EXCEPTION 'Lesson session position may only stay for retry or advance by one'
            USING ERRCODE = '55000';
    END IF;
    IF NEW.active_duration_ms < OLD.active_duration_ms
       OR NEW.active_duration_ms > 43200000
       OR NEW.last_activity_at < OLD.last_activity_at
       OR NEW.current_activity_started_at < OLD.current_activity_started_at THEN
        RAISE EXCEPTION 'Lesson session time measurements must be monotonic and bounded'
            USING ERRCODE = '55000';
    END IF;
    IF NEW.status IN ('completed', 'pending_review')
       AND NEW.current_activity_position <> NEW.total_activity_count + 1 THEN
        RAISE EXCEPTION 'A finalized session must have consumed every published activity'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$phase24_session$;

CREATE TRIGGER trg_lesson_session_state_transition
    BEFORE UPDATE ON lesson_sessions
    FOR EACH ROW EXECUTE FUNCTION guard_lesson_session_state_transition();


COMMENT ON TABLE curriculum_lesson_activities IS
    'Private, immutable, versioned activity definitions. Never serialize definition_json to the student-facing API.';
COMMENT ON TABLE lesson_sessions IS
    'Recoverable learner sessions with server-owned position, duration and completion state.';
COMMENT ON TABLE lesson_session_activity_attempts IS
    'Reserved, idempotent activity submissions linked to persisted assessment evidence.';
COMMENT ON TABLE activity_objective_evidence IS
    'Objective-level academic evidence derived only from validated evaluated attempts.';
COMMENT ON TABLE lesson_completion_reward_events IS
    'Idempotent lesson completion reward ledger; one academic completion reward per user and lesson.';


ALTER TABLE lesson_session_activity_attempts
    ADD CONSTRAINT fk_lesson_session_attempt_assessment_result
    FOREIGN KEY (assessment_attempt_id)
    REFERENCES activity_attempt_results(attempt_id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION guard_lesson_evidence_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Learning session evidence is append-only'
        USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER trg_activity_objective_evidence_append_only
    BEFORE UPDATE ON activity_objective_evidence
    FOR EACH ROW EXECUTE FUNCTION guard_lesson_evidence_append_only();
CREATE TRIGGER trg_lesson_completion_reward_events_append_only
    BEFORE UPDATE ON lesson_completion_reward_events
    FOR EACH ROW EXECUTE FUNCTION guard_lesson_evidence_append_only();

