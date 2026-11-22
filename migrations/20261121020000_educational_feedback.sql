-- Phase 2.5: server-authorized hint disclosure and learner-specific recurring error evidence.
-- Hint bodies are released only after an authenticated, sequential request for the active activity.
CREATE TABLE IF NOT EXISTS lesson_session_hint_reveals (
    session_id UUID NOT NULL,
    user_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    activity_id UUID NOT NULL,
    hint_id UUID NOT NULL,
    hint_order SMALLINT NOT NULL CHECK (hint_order BETWEEN 1 AND 8),
    hint_title VARCHAR(100) NOT NULL CHECK (length(btrim(hint_title)) > 0),
    hint_body VARCHAR(1000) NOT NULL CHECK (length(btrim(hint_body)) > 0),
    penalty_points INTEGER NOT NULL CHECK (penalty_points BETWEEN 0 AND 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (session_id, activity_id, hint_id),
    CONSTRAINT uq_session_activity_hint_order UNIQUE (session_id, activity_id, hint_order),
    CONSTRAINT fk_session_hint_reveal_session
        FOREIGN KEY (session_id, user_id, lesson_id, course_version_id)
        REFERENCES lesson_sessions(id, user_id, lesson_id, course_version_id) ON DELETE CASCADE,
    CONSTRAINT fk_session_hint_reveal_activity
        FOREIGN KEY (activity_id, course_version_id, lesson_id)
        REFERENCES curriculum_lesson_activities(activity_id, course_version_id, lesson_id) ON DELETE RESTRICT,
    CONSTRAINT ck_session_hint_reveal_non_nil CHECK (
        hint_id <> '00000000-0000-0000-0000-000000000000'::UUID
    )
);

CREATE INDEX IF NOT EXISTS idx_session_hint_reveals_recent
    ON lesson_session_hint_reveals(user_id, session_id, activity_id, hint_order);

ALTER TABLE lesson_session_hint_reveals ENABLE ROW LEVEL SECURITY;
ALTER TABLE lesson_session_hint_reveals FORCE ROW LEVEL SECURITY;
CREATE POLICY lesson_session_hint_reveals_select_own
    ON lesson_session_hint_reveals FOR SELECT
    USING (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);
CREATE POLICY lesson_session_hint_reveals_insert_own
    ON lesson_session_hint_reveals FOR INSERT
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);

-- One immutable row per failed assessment attempt and authored error-pattern code.
-- The 90-day count is computed per learner at commit time; no raw student answer is stored here.
CREATE TABLE IF NOT EXISTS learning_error_pattern_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    assessment_attempt_id UUID NOT NULL REFERENCES activity_attempt_results(attempt_id) ON DELETE CASCADE,
    activity_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    error_pattern_code VARCHAR(80) NOT NULL
        CHECK (error_pattern_code ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_learning_error_pattern_attempt
        UNIQUE (user_id, assessment_attempt_id, error_pattern_code),
    FOREIGN KEY (session_id, user_id, lesson_id, course_version_id)
        REFERENCES lesson_sessions(id, user_id, lesson_id, course_version_id) ON DELETE CASCADE,
    FOREIGN KEY (activity_id, course_version_id, lesson_id)
        REFERENCES curriculum_lesson_activities(activity_id, course_version_id, lesson_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_learning_error_patterns_learner_recent
    ON learning_error_pattern_events(user_id, error_pattern_code, recorded_at DESC);

ALTER TABLE learning_error_pattern_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_error_pattern_events FORCE ROW LEVEL SECURITY;
CREATE POLICY learning_error_pattern_events_select_own
    ON learning_error_pattern_events FOR SELECT
    USING (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);
CREATE POLICY learning_error_pattern_events_insert_own
    ON learning_error_pattern_events FOR INSERT
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);

CREATE TRIGGER trg_lesson_session_hint_reveals_append_only
    BEFORE UPDATE ON lesson_session_hint_reveals
    FOR EACH ROW EXECUTE FUNCTION guard_lesson_evidence_append_only();
CREATE TRIGGER trg_learning_error_pattern_events_append_only
    BEFORE UPDATE ON learning_error_pattern_events
    FOR EACH ROW EXECUTE FUNCTION guard_lesson_evidence_append_only();

COMMENT ON TABLE lesson_session_hint_reveals IS
    'Immutable hint-disclosure evidence; parent-session cascades remain available for account/session erasure.';
COMMENT ON TABLE learning_error_pattern_events IS
    'User-scoped, immutable evidence of authored educational error patterns; stores no student answer text and follows parent deletion cascades.';
