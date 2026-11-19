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
            AND (
                pronunciation_status = 'not_required'
                OR (
                    pronunciation_status = 'approved'
                    AND length(btrim(COALESCE(spanish_phonetic, ''))) > 0
                    AND length(btrim(COALESCE(spanish_phonetic_natural, ''))) > 0
                )
            )
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
            AND (
                pronunciation_status = 'not_required'
                OR (
                    pronunciation_status = 'approved'
                    AND length(btrim(COALESCE(spanish_phonetic, ''))) > 0
                    AND length(btrim(COALESCE(spanish_phonetic_natural, ''))) > 0
                )
            )
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
    imported_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
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


-- Publication is an editorial action, not a data-import side effect.
-- It requires a registered editor and a prior review state; published content is immutable.
CREATE OR REPLACE FUNCTION public.guard_lexical_catalog_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public, pg_temp
AS $function$
DECLARE
    v_pronunciation_status TEXT;
    v_editorial_status TEXT;
    v_slow_guide TEXT;
    v_natural_guide TEXT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.publication_status = 'published' THEN
        IF NEW.publication_status <> 'archived' THEN
            RAISE EXCEPTION 'Published lexical content is immutable; create a reviewed catalog revision instead'
                USING ERRCODE = '55000';
        END IF;
    END IF;

    IF NEW.publication_status IS DISTINCT FROM
       CASE WHEN TG_OP = 'INSERT' THEN 'draft' ELSE OLD.publication_status END
       AND NEW.publication_status IN ('review', 'published', 'archived') THEN
        IF NOT public.app_is_content_editor() THEN
            RAISE EXCEPTION 'A registered content editor is required to change lexical publication state'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    IF NEW.publication_status = 'published' THEN
        IF TG_OP = 'INSERT' OR OLD.publication_status <> 'review' THEN
            RAISE EXCEPTION 'Lexical content must pass through review before publication'
                USING ERRCODE = '55000';
        END IF;

        IF TG_TABLE_NAME = 'vocabulary_words' THEN
            v_editorial_status := NEW.editorial_metadata ->> 'editorial_status';
            v_pronunciation_status := NEW.pronunciation_status;
            v_slow_guide := NEW.spanish_phonetic;
            v_natural_guide := NEW.spanish_phonetic_natural;
        ELSIF TG_TABLE_NAME = 'context_sentences' THEN
            v_editorial_status := NEW.editorial_status;
            v_pronunciation_status := NEW.pronunciation_status;
            v_slow_guide := NEW.spanish_phonetic;
            v_natural_guide := NEW.spanish_phonetic_natural;
        ELSE
            v_editorial_status := NEW.editorial_status;
            v_pronunciation_status := 'not_required';
            v_slow_guide := NULL;
            v_natural_guide := NULL;
        END IF;

        IF v_editorial_status <> 'approved' THEN
            RAISE EXCEPTION 'Lexical content requires explicit editorial approval before publication'
                USING ERRCODE = '23514';
        END IF;

        IF v_pronunciation_status = 'approved'
           AND (length(btrim(COALESCE(v_slow_guide, ''))) = 0
                OR length(btrim(COALESCE(v_natural_guide, ''))) = 0) THEN
            RAISE EXCEPTION 'Approved pronunciation requires both slow and natural guides'
                USING ERRCODE = '23514';
        ELSIF v_pronunciation_status <> 'approved'
              AND v_pronunciation_status <> 'not_required' THEN
            RAISE EXCEPTION 'Pronunciation must be approved or explicitly marked not_required'
                USING ERRCODE = '23514';
        END IF;

        IF TG_TABLE_NAME = 'curriculum_comprehension_resources'
           AND NEW.skill = 'listening'
           AND (
             NEW.audio_metadata ->> 'status' <> 'approved'
             OR length(btrim(COALESCE(NEW.audio_metadata ->> 'asset_url', ''))) = 0
           ) THEN
            RAISE EXCEPTION 'Listening resources require a real approved audio asset before publication'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_guard_lexical_catalog_publication ON public.vocabulary_words;
CREATE TRIGGER trg_guard_lexical_catalog_publication
    BEFORE INSERT OR UPDATE ON public.vocabulary_words
    FOR EACH ROW EXECUTE FUNCTION public.guard_lexical_catalog_publication();

DROP TRIGGER IF EXISTS trg_guard_lexical_catalog_publication ON public.context_sentences;
CREATE TRIGGER trg_guard_lexical_catalog_publication
    BEFORE INSERT OR UPDATE ON public.context_sentences
    FOR EACH ROW EXECUTE FUNCTION public.guard_lexical_catalog_publication();

DROP TRIGGER IF EXISTS trg_guard_lexical_catalog_publication ON public.curriculum_comprehension_resources;
CREATE TRIGGER trg_guard_lexical_catalog_publication
    BEFORE INSERT OR UPDATE ON public.curriculum_comprehension_resources
    FOR EACH ROW EXECUTE FUNCTION public.guard_lexical_catalog_publication();

COMMENT ON FUNCTION public.guard_lexical_catalog_publication() IS
    'Only provisioned editors can transition lexical content through review/publication; publication requires reviewed content and valid pronunciation/audio evidence, and published rows are immutable.';
