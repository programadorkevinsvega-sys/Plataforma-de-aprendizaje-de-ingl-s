-- One learning reward can be applied once per user and vocabulary word.
-- Store the applied amounts in the same transaction as user_stats so retries do
-- not duplicate XP, coins, word counts, or streak updates.
CREATE TABLE IF NOT EXISTS learning_progress_events (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    word_id UUID NOT NULL REFERENCES vocabulary_words(id) ON DELETE CASCADE,
    xp_amount INTEGER NOT NULL CHECK (xp_amount BETWEEN 0 AND 10),
    coins_amount INTEGER NOT NULL CHECK (coins_amount BETWEEN 0 AND 2),
    words_learned_delta INTEGER NOT NULL CHECK (words_learned_delta BETWEEN 0 AND 1),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, word_id)
);

ALTER TABLE learning_progress_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS learning_progress_events_user_isolation ON learning_progress_events;
CREATE POLICY learning_progress_events_user_isolation ON learning_progress_events
    FOR ALL
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
