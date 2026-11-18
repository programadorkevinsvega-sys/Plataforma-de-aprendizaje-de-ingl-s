-- Fase 1.3: provenance and idempotency for canonical curriculum package imports.
-- One imported package is the immutable source for one exact course version.

CREATE TABLE IF NOT EXISTS curriculum_content_package_imports (
    course_version_id UUID PRIMARY KEY
        REFERENCES course_versions(id) ON DELETE RESTRICT,
    format VARCHAR(80) NOT NULL
        CHECK (format = 'devfluency.curriculum-content'),
    schema_version INTEGER NOT NULL CHECK (schema_version > 0),
    package_sha256 CHAR(64) NOT NULL
        CHECK (package_sha256 ~ '^[0-9a-f]{64}$'),
    metadata JSONB NOT NULL
        CHECK (jsonb_typeof(metadata) = 'object'),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_curriculum_package_imports_sha256
    ON curriculum_content_package_imports(package_sha256);

ALTER TABLE curriculum_content_package_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_content_package_imports FORCE ROW LEVEL SECURITY;

CREATE POLICY curriculum_content_package_imports_editor_only
    ON curriculum_content_package_imports
    FOR ALL
    USING (app_is_content_editor())
    WITH CHECK (app_is_content_editor());

COMMENT ON TABLE curriculum_content_package_imports IS
    'Immutable provenance and canonical hash for a package imported into one curriculum version.';
COMMENT ON COLUMN curriculum_content_package_imports.package_sha256 IS
    'Canonical SHA-256 emitted by tools/curriculum/validate_content_package.py.';
