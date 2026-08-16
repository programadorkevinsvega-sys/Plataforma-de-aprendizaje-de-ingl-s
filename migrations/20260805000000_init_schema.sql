-- Extensión para generación de UUIDs v4
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Usuarios
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    target_role VARCHAR(50) DEFAULT 'Software Developer',
    current_level VARCHAR(10) DEFAULT 'A1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Banco de Vocabulario en Contexto
CREATE TABLE IF NOT EXISTS vocabulary_words (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word VARCHAR(100) NOT NULL,
    spanish_phonetic VARCHAR(150) NOT NULL,
    spanish_translation VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    level VARCHAR(10) NOT NULL,
    frequency_score FLOAT DEFAULT 1.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vocab_level_cat ON vocabulary_words(level, category);

CREATE TABLE IF NOT EXISTS context_sentences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    word_id UUID REFERENCES vocabulary_words(id) ON DELETE CASCADE,
    english_text TEXT NOT NULL,
    spanish_phonetic TEXT NOT NULL,
    spanish_translation TEXT NOT NULL,
    audio_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sentences_word_id ON context_sentences(word_id);

-- 3. Progreso de Repetición Espaciada (Anki SM-2)
CREATE TABLE IF NOT EXISTS user_srs_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    sentence_id UUID REFERENCES context_sentences(id),
    easiness_factor FLOAT DEFAULT 2.5,
    interval_days INT DEFAULT 1,
    repetitions INT DEFAULT 0,
    next_review TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_sentence UNIQUE (user_id, sentence_id)
);

CREATE INDEX IF NOT EXISTS idx_srs_next_review ON user_srs_progress(user_id, next_review);

-- 4. Exámenes e Historial de Evaluaciones IA
CREATE TABLE IF NOT EXISTS ai_exam_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    level_target VARCHAR(10) NOT NULL,
    score_listening FLOAT NOT NULL,
    score_pronunciation FLOAT NOT NULL,
    score_fluency FLOAT NOT NULL,
    score_vocabulary FLOAT NOT NULL,
    score_grammar FLOAT NOT NULL,
    score_conversation FLOAT NOT NULL,
    total_score FLOAT NOT NULL,
    passed BOOLEAN NOT NULL,
    detected_weaknesses JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exam_user ON ai_exam_sessions(user_id, created_at DESC);

-- 5. Tabla de Estadísticas de Usuario
CREATE TABLE IF NOT EXISTS user_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    xp INTEGER DEFAULT 0,
    streak_days INTEGER DEFAULT 0,
    coins INTEGER DEFAULT 0,
    words_learned INTEGER DEFAULT 0,
    sentences_mastered INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SEGURIDAD MULTI-TENANT: Row Level Security (RLS)
-- ============================================================================

ALTER TABLE user_srs_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS srs_user_isolation ON user_srs_progress;
CREATE POLICY srs_user_isolation ON user_srs_progress
    FOR ALL USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

DROP POLICY IF EXISTS exam_user_isolation ON ai_exam_sessions;
CREATE POLICY exam_user_isolation ON ai_exam_sessions
    FOR ALL USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);

DROP POLICY IF EXISTS stats_user_isolation ON user_stats;
CREATE POLICY stats_user_isolation ON user_stats
    FOR ALL USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid);
