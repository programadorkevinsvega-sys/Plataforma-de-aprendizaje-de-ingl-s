DO $$
DECLARE
    table_oid REGCLASS;
BEGIN
    IF to_regclass('public.lexical_catalog_imports') IS NULL THEN
        RAISE EXCEPTION 'lexical_catalog_imports ledger is missing';
    END IF;
    IF to_regclass('public.curriculum_comprehension_resources') IS NULL THEN
        RAISE EXCEPTION 'curriculum_comprehension_resources is missing';
    END IF;

    FOREACH table_oid IN ARRAY ARRAY[
        'public.vocabulary_words'::REGCLASS,
        'public.context_sentences'::REGCLASS
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_attribute
             WHERE attrelid = table_oid AND attname = 'source_key' AND NOT attisdropped
        ) THEN
            RAISE EXCEPTION 'Table % lacks source_key', table_oid;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_attribute
             WHERE attrelid = table_oid AND attname = 'publication_status' AND NOT attisdropped
        ) THEN
            RAISE EXCEPTION 'Table % lacks publication_status', table_oid;
        END IF;
    END LOOP;

    IF to_regprocedure('public.guard_lexical_catalog_publication()') IS NULL THEN
        RAISE EXCEPTION 'Lexical catalog publication guard function is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.vocabulary_words'::REGCLASS
           AND tgname = 'trg_guard_lexical_catalog_publication'
           AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.context_sentences'::REGCLASS
           AND tgname = 'trg_guard_lexical_catalog_publication'
           AND NOT tgisinternal
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_trigger
         WHERE tgrelid = 'public.curriculum_comprehension_resources'::REGCLASS
           AND tgname = 'trg_guard_lexical_catalog_publication'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'Every lexical content table must enforce the publication guard';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.vocabulary_words'::REGCLASS
           AND conname = 'vocabulary_words_published_review_check'
    ) THEN
        RAISE EXCEPTION 'Vocabulary publication guard is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.context_sentences'::REGCLASS
           AND conname = 'context_sentences_published_review_check'
    ) THEN
        RAISE EXCEPTION 'Example publication guard is missing';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'public.curriculum_comprehension_resources'::REGCLASS
           AND conname = 'ck_comprehension_resource_publication'
    ) THEN
        RAISE EXCEPTION 'Comprehension resource publication guard is missing';
    END IF;
END
$$;
