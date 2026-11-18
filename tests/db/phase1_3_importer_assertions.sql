DO $$
DECLARE
    table_oid REGCLASS;
    rls_enabled BOOLEAN;
    rls_forced BOOLEAN;
    editor_policy_count INTEGER;
    course_policy TEXT;
    child_policy TEXT;
    v_child_table TEXT;
BEGIN
    table_oid := to_regclass('public.curriculum_content_package_imports');
    IF table_oid IS NULL THEN
        RAISE EXCEPTION 'curriculum_content_package_imports table is missing';
    END IF;

    SELECT relrowsecurity, relforcerowsecurity
      INTO rls_enabled, rls_forced
      FROM pg_class
     WHERE oid = table_oid;

    IF NOT rls_enabled OR NOT rls_forced THEN
        RAISE EXCEPTION 'curriculum_content_package_imports must enable and force row-level security';
    END IF;

    SELECT count(*)::INTEGER
      INTO editor_policy_count
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'curriculum_content_package_imports'
       AND policyname = 'curriculum_content_package_imports_editor_only'
       AND cmd = 'ALL';

    IF editor_policy_count <> 1 THEN
        RAISE EXCEPTION 'curriculum package import ledger must have exactly one editor-only write policy';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = table_oid
           AND contype = 'p'
    ) THEN
        RAISE EXCEPTION 'curriculum package import ledger must be unique per course version';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'curriculum_content_package_imports'
           AND column_name = 'content_schema_version_explicit'
           AND is_nullable = 'NO'
    ) THEN
        RAISE EXCEPTION 'package import ledger must preserve explicit content schema version presence';
    END IF;

    IF to_regclass('public.content_editors') IS NULL THEN
        RAISE EXCEPTION 'content_editors registry is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'course_version_reviews'
           AND column_name = 'review_order'
           AND is_identity = 'YES'
    ) THEN
        RAISE EXCEPTION 'course_version_reviews must have a monotonic identity order';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_proc
         WHERE oid = 'public.app_is_content_editor()'::REGPROCEDURE
           AND prosecdef = TRUE
    ) THEN
        RAISE EXCEPTION 'app_is_content_editor must safely verify the registered editor identity';
    END IF;

    IF to_regprocedure('public.assert_course_version_publishable(uuid)') IS NULL
       OR to_regprocedure('public.guard_course_version_publication_completeness()') IS NULL THEN
        RAISE EXCEPTION 'course version publication completeness functions are missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger
         WHERE tgrelid = 'public.course_versions'::REGCLASS
           AND tgname = 'trg_course_version_publication_completeness'
           AND NOT tgisinternal
    ) THEN
        RAISE EXCEPTION 'course version publication completeness trigger is missing';
    END IF;

    SELECT qual
      INTO course_policy
      FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'courses'
       AND policyname = 'courses_published_read';

    IF course_policy IS NULL
       OR position('published' IN lower(course_policy)) = 0
       OR position('app.current_user_id' IN lower(course_policy)) = 0 THEN
        RAISE EXCEPTION 'course read policy must restrict visibility to published/enrolled versions';
    END IF;

    FOREACH v_child_table IN ARRAY ARRAY[
        'course_units',
        'course_lessons',
        'learning_objectives',
        'learning_objective_skills',
        'lesson_learning_objectives',
        'lesson_prerequisites',
        'learning_objective_vocabulary',
        'learning_objective_sentences'
    ] LOOP
        SELECT qual
          INTO child_policy
          FROM pg_policies
         WHERE schemaname = 'public'
           AND pg_policies.tablename = v_child_table
           AND policyname = v_child_table || '_published_or_enrolled_read';

        IF child_policy IS NULL
           OR position('published' IN lower(child_policy)) = 0
           OR position('app.current_user_id' IN lower(child_policy)) = 0 THEN
            RAISE EXCEPTION 'Child content table % is not restricted to published/enrolled versions', table_name;
        END IF;
    END LOOP;
END
$$;
