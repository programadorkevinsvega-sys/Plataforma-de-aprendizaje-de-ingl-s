-- Row-level security hardening and an explicit authenticated leaderboard scope.
-- Run as the schema owner/migration role, not as the application runtime role.

ALTER TABLE user_srs_progress FORCE ROW LEVEL SECURITY;
ALTER TABLE ai_exam_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE user_stats FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stats_leaderboard_select ON user_stats;
CREATE POLICY stats_leaderboard_select ON user_stats
    FOR SELECT
    USING (
        NULLIF(current_setting('app.current_user_id', true), '') IS NOT NULL
        AND current_setting('app.allow_leaderboard', true) = 'true'
    );
