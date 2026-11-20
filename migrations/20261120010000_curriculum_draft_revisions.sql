-- Fase 1.5: auditable revisions for visual edits made while a course version is draft.
-- Every save records the exact editable projection and a canonical SHA-256.

CREATE TABLE IF NOT EXISTS public.curriculum_draft_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_version_id UUID NOT NULL
        REFERENCES public.course_versions(id) ON DELETE RESTRICT,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    content_sha256 CHAR(64) NOT NULL
        CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
    created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_curriculum_draft_revision_number
        UNIQUE (course_version_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_curriculum_draft_revisions_course_created
    ON public.curriculum_draft_revisions(course_version_id, created_at DESC);

ALTER TABLE public.curriculum_draft_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_draft_revisions FORCE ROW LEVEL SECURITY;

CREATE POLICY curriculum_draft_revisions_editor_only
    ON public.curriculum_draft_revisions
    FOR ALL
    USING (public.app_is_content_editor())
    WITH CHECK (public.app_is_content_editor());

CREATE OR REPLACE FUNCTION public.guard_curriculum_draft_revision_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
    RAISE EXCEPTION 'Curriculum draft revision history is append-only'
        USING ERRCODE = '55000';
END
$function$;

DROP TRIGGER IF EXISTS trg_curriculum_draft_revision_immutable
    ON public.curriculum_draft_revisions;
CREATE TRIGGER trg_curriculum_draft_revision_immutable
    BEFORE UPDATE OR DELETE ON public.curriculum_draft_revisions
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_curriculum_draft_revision_immutable();

COMMENT ON TABLE public.curriculum_draft_revisions IS
    'Append-only snapshots and SHA-256 hashes for visual edits saved while a curriculum version is draft.';
