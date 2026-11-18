-- Evidence-backed learner progress for immutable curriculum lessons.
-- Rows are append-only and can only be created by trusted assessment integrations.
CREATE TABLE IF NOT EXISTS course_lesson_progress_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id UUID NOT NULL,
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    evidence_event_id UUID NOT NULL,
    outcome_status VARCHAR(12) NOT NULL CHECK (outcome_status IN ('in_progress', 'completed', 'mastered')),
    mastery_score NUMERIC(5,4) NOT NULL CHECK (mastery_score BETWEEN 0 AND 1),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_lesson_progress_evidence UNIQUE (user_id, evidence_event_id),
    CONSTRAINT fk_lesson_progress_lesson FOREIGN KEY (lesson_id, course_version_id)
        REFERENCES course_lessons(id, course_version_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_lesson_progress_latest
    ON course_lesson_progress_events(user_id, course_version_id, lesson_id, recorded_at DESC, id DESC);
ALTER TABLE course_lesson_progress_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_lesson_progress_events FORCE ROW LEVEL SECURITY;
CREATE POLICY course_lesson_progress_read_own ON course_lesson_progress_events
    FOR SELECT USING (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);
CREATE POLICY course_lesson_progress_insert_own ON course_lesson_progress_events
    FOR INSERT WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID);
CREATE OR REPLACE FUNCTION guard_course_lesson_progress_append_only()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'Curriculum progress evidence is append-only' USING ERRCODE = '55000';
END
$$;
CREATE TRIGGER trg_course_lesson_progress_append_only
    BEFORE UPDATE OR DELETE ON course_lesson_progress_events
    FOR EACH ROW EXECUTE FUNCTION guard_course_lesson_progress_append_only();
