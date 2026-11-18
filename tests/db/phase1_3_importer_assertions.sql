DO $$
DECLARE
    table_oid REGCLASS;
    rls_enabled BOOLEAN;
    rls_forced BOOLEAN;
    editor_policy_count INTEGER;
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
END
$$;
