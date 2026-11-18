-- Fase 1.3: authenticated editorial capability for curriculum import/review tools.
-- The GUC app.content_editor is no longer treated as authorization by itself.
-- A trusted backend/CLI must set app.current_user_id to a registered editor.

CREATE TABLE IF NOT EXISTS content_editors (
    user_id UUID PRIMARY KEY
        REFERENCES users(id) ON DELETE RESTRICT,
    granted_by UUID
        REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

REVOKE ALL ON TABLE public.content_editors FROM PUBLIC;

CREATE OR REPLACE FUNCTION app_is_content_editor()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM public.content_editors AS editor
         WHERE editor.user_id =
               NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    )
$$;

COMMENT ON TABLE content_editors IS
    'Explicitly provisioned users allowed to create, import, review and publish curriculum versions.';
COMMENT ON FUNCTION app_is_content_editor() IS
    'Checks the transaction-local app.current_user_id against the provisioned content editor registry; app.content_editor GUC alone grants no access.';
