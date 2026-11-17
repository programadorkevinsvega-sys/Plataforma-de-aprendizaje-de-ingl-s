-- Executed as database owner to create fixtures. Access checks run as a
-- non-owner PostgreSQL role without BYPASSRLS.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'devfluency_schema_test') THEN
        CREATE ROLE devfluency_schema_test NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
END
$$;

GRANT SELECT ON
    courses, course_versions, course_units, course_lessons,
    learning_objectives, learning_skills, learning_objective_skills,
    lesson_learning_objectives, lesson_prerequisites,
    learning_objective_vocabulary, learning_objective_sentences
TO devfluency_schema_test;
GRANT SELECT, INSERT, UPDATE, DELETE ON course_enrollments TO devfluency_schema_test;

INSERT INTO users (id, email, password_hash, full_name, target_role, current_level)
VALUES
    ('10000000-0000-4000-8000-000000000001', 'phase12-one@example.test', 'test-hash', 'Schema Test One', 'learner', 'A1'),
    ('10000000-0000-4000-8000-000000000002', 'phase12-two@example.test', 'test-hash', 'Schema Test Two', 'learner', 'A1'),
    ('10000000-0000-4000-8000-000000000003', 'phase12-three@example.test', 'test-hash', 'Schema Test Three', 'learner', 'A1');

INSERT INTO courses (id, slug, track_code)
VALUES
    ('20000000-0000-4000-8000-000000000001', 'phase12-general-test', 'general'),
    ('20000000-0000-4000-8000-000000000002', 'phase12-draft-test', 'technology');

-- One stable route can publish multiple levels at the same time.
INSERT INTO course_versions (
    id, course_id, version_number, status, cefr_level, title, description, created_by
)
VALUES (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    1, 'draft', 'A1', 'Published A1 test course', 'A1 fixture',
    '10000000-0000-4000-8000-000000000001'
);

UPDATE course_versions
SET status = 'review', submitted_at = NOW()
WHERE id = '30000000-0000-4000-8000-000000000003';

INSERT INTO course_version_reviews (
    course_version_id, reviewer_id, decision, comments
)
VALUES (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'approved',
    'Second level in the same published track'
);

UPDATE course_versions
SET status = 'published',
    reviewed_by = '10000000-0000-4000-8000-000000000002',
    published_at = NOW()
WHERE id = '30000000-0000-4000-8000-000000000003';

INSERT INTO course_versions (
    id, course_id, version_number, status, cefr_level, title, description,
    created_by
)
VALUES
    (
        '30000000-0000-4000-8000-000000000001',
        '20000000-0000-4000-8000-000000000001',
        1, 'draft', 'PRE_A1', 'Published test course', 'Published fixture',
        '10000000-0000-4000-8000-000000000001'
    ),
    (
        '30000000-0000-4000-8000-000000000002',
        '20000000-0000-4000-8000-000000000002',
        1, 'draft', 'A2', 'Draft test course', 'Draft fixture',
        '10000000-0000-4000-8000-000000000001'
    );

INSERT INTO course_units (id, course_version_id, unit_code, position, title, theme)
VALUES (
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'unit-01', 1, 'First unit', 'Introductions'
);

INSERT INTO course_lessons (
    id, course_version_id, unit_id, lesson_code, position, lesson_pattern, title
)
VALUES (
    '50000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'lesson-01', 1, 'discover', 'First lesson'
);

INSERT INTO learning_objectives (
    id, course_version_id, objective_code, description, success_criteria, position
)
VALUES (
    '60000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'objective-01', 'Understand a basic greeting',
    'Select the correct greeting in at least four of five examples', 1
);

INSERT INTO learning_objective_skills (
    course_version_id, learning_objective_id, skill_code, is_primary
)
VALUES (
    '30000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'listening', TRUE
);

INSERT INTO lesson_learning_objectives (
    course_version_id, lesson_id, learning_objective_id, position, is_required
)
VALUES (
    '30000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    1, TRUE
);

UPDATE course_versions
SET status = 'review', submitted_at = NOW()
WHERE id = '30000000-0000-4000-8000-000000000001';

DO $$
DECLARE
    blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE course_versions
        SET title = 'Changed while under review'
        WHERE id = '30000000-0000-4000-8000-000000000001';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN blocked := TRUE;
    END;
    IF NOT blocked THEN
        RAISE EXCEPTION 'A curriculum version under review was mutable';
    END IF;
END
$$;

INSERT INTO course_version_reviews (
    course_version_id, reviewer_id, decision, comments
)
VALUES (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'approved',
    'Automated schema fixture approval'
);

UPDATE course_versions
SET status = 'published',
    reviewed_by = '10000000-0000-4000-8000-000000000002',
    published_at = NOW()
WHERE id = '30000000-0000-4000-8000-000000000001';



INSERT INTO course_enrollments (user_id, course_version_id)
VALUES (
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001'
);

BEGIN;
SET LOCAL ROLE devfluency_schema_test;
SELECT set_config('app.current_user_id', '10000000-0000-4000-8000-000000000001', TRUE);
DO $$
DECLARE
    visible_courses BIGINT;
    visible_versions BIGINT;
    visible_units BIGINT;
    visible_lessons BIGINT;
    visible_enrollments BIGINT;
BEGIN
    SELECT count(*) INTO visible_courses FROM courses;
    SELECT count(*) INTO visible_versions FROM course_versions;
    SELECT count(*) INTO visible_units FROM course_units;
    SELECT count(*) INTO visible_lessons FROM course_lessons;
    SELECT count(*) INTO visible_enrollments FROM course_enrollments;

    IF visible_courses <> 1 OR visible_versions <> 2
       OR visible_units <> 1 OR visible_lessons <> 1 THEN
        RAISE EXCEPTION 'Published-content RLS failed: courses %, versions %, units %, lessons %',
            visible_courses, visible_versions, visible_units, visible_lessons;
    END IF;
    IF visible_enrollments <> 0 THEN
        RAISE EXCEPTION 'Enrollment RLS exposed another user enrollment';
    END IF;
END
$$;

INSERT INTO course_enrollments (user_id, course_version_id)
VALUES (
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001'
);

DO $$
DECLARE
    visible_enrollments BIGINT;
    identity_change_blocked BOOLEAN := FALSE;
BEGIN
    SELECT count(*) INTO visible_enrollments FROM course_enrollments;
    IF visible_enrollments <> 1 THEN
        RAISE EXCEPTION 'User cannot read its own enrollment';
    END IF;

    BEGIN
        UPDATE course_enrollments
        SET course_version_id = '30000000-0000-4000-8000-000000000003'
        WHERE user_id = '10000000-0000-4000-8000-000000000001';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN identity_change_blocked := TRUE;
    END;
    IF NOT identity_change_blocked THEN
        RAISE EXCEPTION 'Enrollment version pin was mutable';
    END IF;

    BEGIN
        INSERT INTO course_enrollments (user_id, course_version_id)
        VALUES (
            '10000000-0000-4000-8000-000000000002',
            '30000000-0000-4000-8000-000000000003'
        );
        RAISE EXCEPTION 'RLS accepted an enrollment for a different user'
            USING ERRCODE = 'P0001';
    EXCEPTION
        WHEN insufficient_privilege THEN NULL;
    END;
END
$$;
COMMIT;

BEGIN;
SET LOCAL ROLE devfluency_schema_test;
SELECT set_config('app.content_editor', 'true', TRUE);
DO $$
DECLARE
    visible_versions BIGINT;
BEGIN
    SELECT count(*) INTO visible_versions FROM course_versions;
    IF visible_versions <> 3 THEN
        RAISE EXCEPTION 'Authorized editorial context cannot see all draft/published versions';
    END IF;
END
$$;
COMMIT;

DO $$
DECLARE
    blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE courses
        SET track_code = 'technology'
        WHERE id = '20000000-0000-4000-8000-000000000001';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN blocked := TRUE;
    END;
    IF NOT blocked THEN
        RAISE EXCEPTION 'Course track identity was mutable after version creation';
    END IF;
END
$$;

DO $$
DECLARE
    blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        UPDATE course_versions
        SET title = 'Mutated published title'
        WHERE id = '30000000-0000-4000-8000-000000000001';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN blocked := TRUE;
    END;
    IF NOT blocked THEN
        RAISE EXCEPTION 'Published course version was mutable';
    END IF;

    blocked := FALSE;
    BEGIN
        UPDATE course_units
        SET title = 'Mutated published unit'
        WHERE id = '40000000-0000-4000-8000-000000000001';
    EXCEPTION
        WHEN SQLSTATE '55000' THEN blocked := TRUE;
    END;
    IF NOT blocked THEN
        RAISE EXCEPTION 'Published child content was mutable';
    END IF;
END
$$;

DO $$
DECLARE
    blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO course_enrollments (user_id, course_version_id)
        VALUES (
            '10000000-0000-4000-8000-000000000003',
            '30000000-0000-4000-8000-000000000002'
        );
    EXCEPTION
        WHEN check_violation THEN blocked := TRUE;
    END;
    IF NOT blocked THEN
        RAISE EXCEPTION 'Draft version accepted a new enrollment';
    END IF;
END
$$;

UPDATE course_versions
SET status = 'archived', archived_at = NOW(), updated_at = NOW()
WHERE id = '30000000-0000-4000-8000-000000000001';

-- A student enrolled before archival retains read access to the exact
-- historical version and its child content. A non-enrolled student does not.
BEGIN;
SET LOCAL ROLE devfluency_schema_test;
SELECT set_config('app.current_user_id', '10000000-0000-4000-8000-000000000001', TRUE);
DO $$
DECLARE
    visible_versions BIGINT;
    visible_units BIGINT;
    visible_lessons BIGINT;
    visible_enrollments BIGINT;
BEGIN
    SELECT count(*) INTO visible_versions FROM course_versions
    WHERE id = '30000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO visible_units FROM course_units
    WHERE id = '40000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO visible_lessons FROM course_lessons
    WHERE id = '50000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO visible_enrollments FROM course_enrollments;

    IF visible_versions <> 1 OR visible_units <> 1
       OR visible_lessons <> 1 OR visible_enrollments <> 1 THEN
        RAISE EXCEPTION 'Archived enrollment history was not accessible to its owner';
    END IF;
END
$$;
SELECT set_config('app.current_user_id', '10000000-0000-4000-8000-000000000003', TRUE);
DO $$
DECLARE
    visible_versions BIGINT;
    visible_lessons BIGINT;
BEGIN
    SELECT count(*) INTO visible_versions FROM course_versions
    WHERE id = '30000000-0000-4000-8000-000000000001';
    SELECT count(*) INTO visible_lessons FROM course_lessons
    WHERE id = '50000000-0000-4000-8000-000000000001';
    IF visible_versions <> 0 OR visible_lessons <> 0 THEN
        RAISE EXCEPTION 'Non-enrolled user can view archived curriculum content';
    END IF;
END
$$;
COMMIT;

DO $$
DECLARE
    blocked BOOLEAN := FALSE;
BEGIN
    BEGIN
        INSERT INTO course_enrollments (user_id, course_version_id)
        VALUES (
            '10000000-0000-4000-8000-000000000003',
            '30000000-0000-4000-8000-000000000001'
        );
    EXCEPTION
        WHEN check_violation THEN blocked := TRUE;
    END;
    IF NOT blocked THEN
        RAISE EXCEPTION 'Archived version accepted a new enrollment';
    END IF;
END
$$;

DO $$
DECLARE
    skill_count BIGINT;
BEGIN
    SELECT count(*) INTO skill_count FROM learning_skills;
    IF skill_count < 9 THEN
        RAISE EXCEPTION 'Expected nine initial learning skills, found %', skill_count;
    END IF;
END
$$;
