DO $$
DECLARE
    v_rls BOOLEAN;
    v_force_rls BOOLEAN;
BEGIN
    IF to_regclass('public.curriculum_draft_revisions') IS NULL THEN
        RAISE EXCEPTION 'curriculum_draft_revisions table is missing';
    END IF;

    SELECT relrowsecurity, relforcerowsecurity
      INTO v_rls, v_force_rls
      FROM pg_class
     WHERE oid = 'public.curriculum_draft_revisions'::regclass;

    IF NOT v_rls OR NOT v_force_rls THEN
        RAISE EXCEPTION 'Draft revision history must enable and force row-level security';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'curriculum_draft_revisions'
           AND policyname = 'curriculum_draft_revisions_editor_only'
           AND cmd = 'ALL'
    ) THEN
        RAISE EXCEPTION 'Draft revision history editor-only RLS policy is missing';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_trigger
         WHERE tgrelid = 'public.curriculum_draft_revisions'::regclass
           AND tgname = 'trg_curriculum_draft_revision_immutable'
           AND NOT tgisinternal
           AND tgenabled <> 'D'
    ) THEN
        RAISE EXCEPTION 'Draft revision append-only trigger is missing or disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'public.curriculum_draft_revisions'::regclass
           AND conname = 'uq_curriculum_draft_revision_number'
    ) THEN
        RAISE EXCEPTION 'Draft revision number uniqueness is not enforced';
    END IF;
END
$$;
