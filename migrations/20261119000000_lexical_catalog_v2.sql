-- Fase 1.4: persist the v2 lexical catalog without exposing unreviewed content.
-- Existing seed rows are retained for historical SRS references, but are hidden from
-- student-facing vocabulary queries until explicitly reviewed and published.

ALTER TABLE public.vocabulary_words
    ALTER COLUMN word TYPE TEXT,
    ALTER COLUMN spanish_phonetic TYPE TEXT,
    ALTER COLUMN spanish_phonetic DROP NOT NULL,
    ALTER COLUMN spanish_translation TYPE TEXT,
    ALTER COLUMN spanish_phonetic_natural TYPE TEXT;

ALTER TABLE public.vocabulary_words
    ADD COLUMN IF NOT EXISTS source_key TEXT,
    ADD COLUMN IF NOT EXISTS source_catalog TEXT,
    ADD COLUMN IF NOT EXISTS catalog_hash CHAR(64),
    ADD COLUMN IF NOT EXISTS lexical_type TEXT,
    ADD COLUMN IF NOT EXISTS definition_en TEXT,
    ADD COLUMN IF NOT EXISTS tracks TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS lexical_register TEXT,
    ADD COLUMN IF NOT EXISTS editorial_priority TEXT,
    ADD COLUMN IF NOT EXISTS usefulness TEXT,
    ADD COLUMN IF NOT EXISTS frequency_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS context_tags TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS usage_mode TEXT,
    ADD COLUMN IF NOT EXISTS pronunciation_status TEXT NOT NULL DEFAULT 'legacy_pending_review',
    ADD COLUMN IF NOT EXISTS pronunciation_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS editorial_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'legacy_pending_review';

ALTER TABLE public.vocabulary_words
    ALTER COLUMN publication_status SET DEFAULT 'draft';

ALTER TABLE public.vocabulary_words
    DROP CONSTRAINT IF EXISTS vocabulary_words_publication_status_check;
ALTER TABLE public.vocabulary_words
    ADD CONSTRAINT vocabulary_words_publication_status_check
    CHECK (publication_status IN ('draft', 'review', 'published', 'archived', 'legacy_pending_review'));

ALTER TABLE public.vocabulary_words
    DROP CONSTRAINT IF EXISTS vocabulary_words_published_review_check;
ALTER TABLE public.vocabulary_words
    ADD CONSTRAINT vocabulary_words_published_review_check
    CHECK (
        publication_status <> 'published'
        OR (
            editorial_metadata ->> 'editorial_status' = 'approved'
            AND pronunciation_status IN ('approved', 'not_required')
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_vocabulary_words_source_key
    ON public.vocabulary_words(source_key)
    WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vocabulary_words_published_level_category
    ON public.vocabulary_words(level, category, word)
    WHERE publication_status = 'published';
CREATE INDEX IF NOT EXISTS idx_vocabulary_words_catalog_status
    ON public.vocabulary_words(source_catalog, publication_status)
    WHERE source_catalog IS NOT NULL;

ALTER TABLE public.context_sentences
    ALTER COLUMN spanish_phonetic DROP NOT NULL,
    ALTER COLUMN spanish_translation TYPE TEXT;

ALTER TABLE public.context_sentences
    ADD COLUMN IF NOT EXISTS source_key TEXT,
    ADD COLUMN IF NOT EXISTS source_catalog TEXT,
    ADD COLUMN IF NOT EXISTS catalog_hash CHAR(64),
    ADD COLUMN IF NOT EXISTS position INTEGER,
    ADD COLUMN IF NOT EXISTS pronunciation_status TEXT NOT NULL DEFAULT 'legacy_pending_review',
    ADD COLUMN IF NOT EXISTS pronunciation_candidates JSONB NOT NULL DEFAULT '[]'::JSONB,
    ADD COLUMN IF NOT EXISTS editorial_status TEXT NOT NULL DEFAULT 'legacy_pending_review',
    ADD COLUMN IF NOT EXISTS audio_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS provenance JSONB NOT NULL DEFAULT '{}'::JSONB,
    ADD COLUMN IF NOT EXISTS publication_status TEXT NOT NULL DEFAULT 'legacy_pending_review';

ALTER TABLE public.context_sentences
    ALTER COLUMN publication_status SET DEFAULT 'draft';

ALTER TABLE public.context_sentences
    DROP CONSTRAINT IF EXISTS context_sentences_publication_status_check;
ALTER TABLE public.context_sentences
    ADD CONSTRAINT context_sentences_publication_status_check
    CHECK (publication_status IN ('draft', 'review', 'published', 'archived', 'legacy_pending_review'));

ALTER TABLE public.context_sentences
    DROP CONSTRAINT IF EXISTS context_sentences_published_review_check;
ALTER TABLE public.context_sentences
    ADD CONSTRAINT context_sentences_published_review_check
    CHECK (
        publication_status <> 'published'
        OR (
            editorial_status = 'approved'
            AND pronunciation_status IN ('approved', 'not_required')
        )
    );

CREATE UNIQUE INDEX IF NOT EXISTS uq_context_sentences_source_key
    ON public.context_sentences(source_key)
    WHERE source_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_context_sentences_published_word
    ON public.context_sentences(word_id, position)
    WHERE publication_status = 'published';

CREATE TABLE IF NOT EXISTS public.curriculum_comprehension_resources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_key TEXT NOT NULL UNIQUE,
    source_catalog TEXT NOT NULL,
    catalog_hash CHAR(64) NOT NULL,
    track TEXT NOT NULL CHECK (track IN ('general', 'technology')),
    cefr_level TEXT NOT NULL CHECK (cefr_level IN ('PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    skill TEXT NOT NULL CHECK (skill IN ('reading', 'listening')),
    title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
    topic TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL CHECK (length(btrim(content)) > 0),
    word_count INTEGER NOT NULL CHECK (word_count > 0),
    sentence_count INTEGER,
    estimated_minutes INTEGER,
    difficulty_profile JSONB NOT NULL,
    comprehension_focus TEXT NOT NULL DEFAULT '',
    lexical_tags TEXT[] NOT NULL DEFAULT '{}',
    transcript_available BOOLEAN NOT NULL DEFAULT FALSE,
    audio_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    editorial_status TEXT NOT NULL DEFAULT 'pending_editorial_and_level_review',
    publication_status TEXT NOT NULL DEFAULT 'draft'
        CHECK (publication_status IN ('draft', 'review', 'published', 'archived')),
    provenance JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_comprehension_resource_publication CHECK (
        publication_status <> 'published'
        OR (
            editorial_status = 'approved'
            AND (
                skill <> 'listening'
                OR (
                    audio_metadata ->> 'status' = 'approved'
                    AND length(btrim(COALESCE(audio_metadata ->> 'asset_url', ''))) > 0
                )
            )
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_comprehension_resources_published
    ON public.curriculum_comprehension_resources(track, cefr_level, skill)
    WHERE publication_status = 'published';

CREATE TABLE IF NOT EXISTS public.lexical_catalog_imports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    catalog_key TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    content_sha256 CHAR(64) NOT NULL,
    lexical_items INTEGER NOT NULL CHECK (lexical_items >= 0),
    examples INTEGER NOT NULL CHECK (examples >= 0),
    comprehension_resources INTEGER NOT NULL CHECK (comprehension_resources >= 0),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    UNIQUE (catalog_key, content_sha256)
);

COMMENT ON TABLE public.curriculum_comprehension_resources IS
    'Versioned reading/listening source materials; listening stays unavailable until a real approved audio asset exists.';
COMMENT ON TABLE public.lexical_catalog_imports IS
    'Idempotency ledger for transactional imports of the versioned lexical catalog.';
COMMENT ON COLUMN public.vocabulary_words.publication_status IS
    'Only published, editorially approved v2 rows may be returned by student-facing vocabulary APIs; legacy rows remain retained but hidden pending review.';
