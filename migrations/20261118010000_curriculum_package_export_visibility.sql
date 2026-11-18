-- Fase 1.3: preserve package format details for round-trip export and
-- prevent students from reading content that is still a draft or in review.

ALTER TABLE curriculum_content_package_imports
    ADD COLUMN IF NOT EXISTS content_schema_version_explicit BOOLEAN NOT NULL DEFAULT FALSE;

-- Course rows are visible only when at least one version is published or
-- specifically enrolled by the current user. Editors retain administrative access.
DROP POLICY IF EXISTS courses_published_read ON courses;
CREATE POLICY courses_published_read ON courses
    FOR SELECT
    USING (
        app_is_content_editor()
        OR EXISTS (
            SELECT 1
              FROM course_versions AS version
             WHERE version.course_id = courses.id
               AND (
                   version.status = 'published'
                   OR EXISTS (
                       SELECT 1
                         FROM course_enrollments AS enrollment
                        WHERE enrollment.course_version_id = version.id
                          AND enrollment.user_id =
                              NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
                   )
               )
        )
    );

-- Child rows follow the visibility of their exact parent CourseVersion.
-- This replaces the former broad EXISTS policy, which also exposed draft content.
DO $$
DECLARE
    table_name TEXT;
    policy_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'course_units',
        'course_lessons',
        'learning_objectives',
        'learning_objective_skills',
        'lesson_learning_objectives',
        'lesson_prerequisites',
        'learning_objective_vocabulary',
        'learning_objective_sentences'
    ] LOOP
        policy_name := table_name || '_published_or_enrolled_read';
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', policy_name, table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I
             FOR SELECT
             USING (
                 app_is_content_editor()
                 OR EXISTS (
                     SELECT 1
                       FROM course_versions AS version
                      WHERE version.id = %I.course_version_id
                        AND (
                            version.status = ''published''
                            OR EXISTS (
                                SELECT 1
                                  FROM course_enrollments AS enrollment
                                 WHERE enrollment.course_version_id = version.id
                                   AND enrollment.user_id =
                                       NULLIF(current_setting(''app.current_user_id'', TRUE), '''')::UUID
                            )
                        )
                 )
             )',
            policy_name,
            table_name,
            table_name
        );
    END LOOP;
END
$$;

COMMENT ON COLUMN curriculum_content_package_imports.content_schema_version_explicit IS
    'Whether content_schema_version was explicitly present in the source package, preserving canonical export shape.';
