-- Fase 1.2: catálogo curricular versionado.
-- Adición compatible: no altera ni elimina las tablas usadas por los servicios actuales.
-- El contenido publicado es inmutable; una edición debe crear otra CourseVersion.

CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug VARCHAR(120) NOT NULL UNIQUE
        CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    track_code VARCHAR(20) NOT NULL
        CHECK (track_code IN ('general', 'technology')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS course_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    status VARCHAR(12) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'review', 'published', 'archived')),
    cefr_level VARCHAR(10) NOT NULL
        CHECK (cefr_level IN ('PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
    title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    locale VARCHAR(12) NOT NULL DEFAULT 'en',
    content_schema_version INTEGER NOT NULL DEFAULT 1
        CHECK (content_schema_version > 0),
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    CONSTRAINT uq_course_version_number UNIQUE (course_id, cefr_level, version_number),
    CONSTRAINT uq_course_version_id_course UNIQUE (id, course_id),
    CONSTRAINT ck_course_version_lifecycle CHECK (
        (status IN ('draft', 'review') AND published_at IS NULL AND archived_at IS NULL)
        OR
        (status = 'published' AND published_at IS NOT NULL AND archived_at IS NULL)
        OR
        (status = 'archived' AND published_at IS NOT NULL AND archived_at IS NOT NULL)
    ),
    CONSTRAINT ck_course_version_review_submitted CHECK (
        status <> 'review' OR submitted_at IS NOT NULL
    )
);

-- Solo una versión por nivel puede estar publicada en cada ruta/curso.
-- Los niveles General y Tecnología avanzan en paralelo; las inscripciones históricas
-- siguen apuntando a la versión archivada.
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_level_one_published_version
    ON course_versions(course_id, cefr_level) WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_course_versions_published_level
    ON course_versions(cefr_level, course_id) WHERE status = 'published';

CREATE OR REPLACE FUNCTION guard_course_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF (NEW.slug IS DISTINCT FROM OLD.slug OR NEW.track_code IS DISTINCT FROM OLD.track_code)
       AND EXISTS (
           SELECT 1 FROM course_versions
           WHERE course_id = OLD.id
       ) THEN
        RAISE EXCEPTION 'A course slug and track are stable after the first version is created'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_course_identity_stable
    BEFORE UPDATE OF slug, track_code ON courses
    FOR EACH ROW EXECUTE FUNCTION guard_course_identity();

CREATE TABLE IF NOT EXISTS course_units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE RESTRICT,
    unit_code VARCHAR(80) NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
    theme VARCHAR(120) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_course_unit_code UNIQUE (course_version_id, unit_code),
    CONSTRAINT uq_course_unit_position UNIQUE (course_version_id, position),
    CONSTRAINT uq_course_unit_id_version UNIQUE (id, course_version_id)
);

CREATE TABLE IF NOT EXISTS course_lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_version_id UUID NOT NULL,
    unit_id UUID NOT NULL,
    lesson_code VARCHAR(80) NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    lesson_pattern VARCHAR(16) NOT NULL DEFAULT 'custom'
        CHECK (lesson_pattern IN ('discover', 'understand', 'practice', 'integrate', 'custom')),
    title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
    description TEXT NOT NULL DEFAULT '',
    estimated_minutes INTEGER CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_course_lesson_unit_version
        FOREIGN KEY (unit_id, course_version_id)
        REFERENCES course_units(id, course_version_id) ON DELETE RESTRICT,
    CONSTRAINT uq_course_lesson_code UNIQUE (course_version_id, lesson_code),
    CONSTRAINT uq_course_lesson_position UNIQUE (unit_id, position),
    CONSTRAINT uq_course_lesson_id_version UNIQUE (id, course_version_id)
);

CREATE TABLE IF NOT EXISTS learning_skills (
    code VARCHAR(24) PRIMARY KEY,
    display_name VARCHAR(80) NOT NULL,
    skill_family VARCHAR(16) NOT NULL
        CHECK (skill_family IN ('language', 'receptive', 'productive', 'interactive', 'transversal')),
    description TEXT NOT NULL DEFAULT ''
);

INSERT INTO learning_skills (code, display_name, skill_family, description) VALUES
    ('vocabulary', 'Vocabulary', 'language', 'Receptive and productive lexical knowledge'),
    ('grammar', 'Grammar', 'language', 'Grammatical range, accuracy and control'),
    ('listening', 'Listening', 'receptive', 'Understanding spoken language from audio evidence'),
    ('reading', 'Reading', 'receptive', 'Understanding written texts'),
    ('writing', 'Writing', 'productive', 'Producing written language'),
    ('speaking', 'Speaking', 'productive', 'Producing spoken language from audio evidence'),
    ('interaction', 'Interaction', 'interactive', 'Managing turns and co-constructing meaning'),
    ('mediation', 'Mediation', 'transversal', 'Selecting, reformulating and conveying information'),
    ('phonology', 'Phonological competence', 'transversal', 'Intelligibility, sounds, stress, rhythm and intonation')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS learning_objectives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE RESTRICT,
    objective_code VARCHAR(80) NOT NULL,
    description TEXT NOT NULL CHECK (length(btrim(description)) > 0),
    success_criteria TEXT NOT NULL CHECK (length(btrim(success_criteria)) > 0),
    position INTEGER NOT NULL CHECK (position > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_learning_objective_code UNIQUE (course_version_id, objective_code),
    CONSTRAINT uq_learning_objective_position UNIQUE (course_version_id, position),
    CONSTRAINT uq_learning_objective_id_version UNIQUE (id, course_version_id)
);

CREATE TABLE IF NOT EXISTS learning_objective_skills (
    course_version_id UUID NOT NULL,
    learning_objective_id UUID NOT NULL,
    skill_code VARCHAR(24) NOT NULL REFERENCES learning_skills(code) ON DELETE RESTRICT,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (learning_objective_id, skill_code),
    FOREIGN KEY (learning_objective_id, course_version_id)
        REFERENCES learning_objectives(id, course_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS lesson_learning_objectives (
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    learning_objective_id UUID NOT NULL,
    position INTEGER NOT NULL CHECK (position > 0),
    is_required BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (lesson_id, learning_objective_id),
    CONSTRAINT uq_lesson_objective_position UNIQUE (lesson_id, position),
    FOREIGN KEY (lesson_id, course_version_id)
        REFERENCES course_lessons(id, course_version_id) ON DELETE RESTRICT,
    FOREIGN KEY (learning_objective_id, course_version_id)
        REFERENCES learning_objectives(id, course_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS lesson_prerequisites (
    course_version_id UUID NOT NULL,
    lesson_id UUID NOT NULL,
    prerequisite_lesson_id UUID NOT NULL,
    required_state VARCHAR(12) NOT NULL DEFAULT 'completed'
        CHECK (required_state IN ('completed', 'mastered')),
    minimum_mastery_score NUMERIC(5,4) NOT NULL DEFAULT 0.8000
        CHECK (minimum_mastery_score BETWEEN 0 AND 1),
    PRIMARY KEY (lesson_id, prerequisite_lesson_id),
    CHECK (lesson_id <> prerequisite_lesson_id),
    FOREIGN KEY (lesson_id, course_version_id)
        REFERENCES course_lessons(id, course_version_id) ON DELETE RESTRICT,
    FOREIGN KEY (prerequisite_lesson_id, course_version_id)
        REFERENCES course_lessons(id, course_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS learning_objective_vocabulary (
    course_version_id UUID NOT NULL,
    learning_objective_id UUID NOT NULL,
    vocabulary_word_id UUID NOT NULL REFERENCES vocabulary_words(id) ON DELETE RESTRICT,
    usage_mode VARCHAR(12) NOT NULL
        CHECK (usage_mode IN ('receptive', 'productive', 'both')),
    position INTEGER NOT NULL CHECK (position > 0),
    PRIMARY KEY (learning_objective_id, vocabulary_word_id),
    CONSTRAINT uq_objective_vocabulary_position UNIQUE (learning_objective_id, position),
    FOREIGN KEY (learning_objective_id, course_version_id)
        REFERENCES learning_objectives(id, course_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS learning_objective_sentences (
    course_version_id UUID NOT NULL,
    learning_objective_id UUID NOT NULL,
    context_sentence_id UUID NOT NULL REFERENCES context_sentences(id) ON DELETE RESTRICT,
    usage_mode VARCHAR(12) NOT NULL
        CHECK (usage_mode IN ('listening', 'reading', 'speaking', 'writing', 'example')),
    position INTEGER NOT NULL CHECK (position > 0),
    PRIMARY KEY (learning_objective_id, context_sentence_id),
    CONSTRAINT uq_objective_sentence_position UNIQUE (learning_objective_id, position),
    FOREIGN KEY (learning_objective_id, course_version_id)
        REFERENCES learning_objectives(id, course_version_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS course_version_reviews (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE RESTRICT,
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    decision VARCHAR(20) NOT NULL
        CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
    comments TEXT NOT NULL DEFAULT '',
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION guard_course_version_review_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    version_status VARCHAR(12);
BEGIN
    SELECT status INTO version_status
    FROM course_versions
    WHERE id = NEW.course_version_id
    FOR UPDATE;

    IF version_status IS DISTINCT FROM 'review' OR NEW.reviewer_id IS NULL THEN
        RAISE EXCEPTION 'Review decisions require a reviewer and a course version in review'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_course_version_review_insert
    BEFORE INSERT ON course_version_reviews
    FOR EACH ROW EXECUTE FUNCTION guard_course_version_review_insert();

CREATE OR REPLACE FUNCTION guard_course_version_review_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Editorial review history is append-only'
            USING ERRCODE = '55000';
    END IF;

    IF (to_jsonb(NEW) - 'reviewer_id') IS DISTINCT FROM (to_jsonb(OLD) - 'reviewer_id')
       OR (NEW.reviewer_id IS NOT NULL AND NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id) THEN
        RAISE EXCEPTION 'Editorial review decisions are immutable'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_course_version_review_immutability
    BEFORE UPDATE OR DELETE ON course_version_reviews
    FOR EACH ROW EXECUTE FUNCTION guard_course_version_review_immutability();

CREATE TABLE IF NOT EXISTS course_enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_version_id UUID NOT NULL REFERENCES course_versions(id) ON DELETE RESTRICT,
    status VARCHAR(12) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'withdrawn')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT ck_course_enrollment_completion CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status <> 'completed' AND completed_at IS NULL)
    ),
    CONSTRAINT uq_user_course_version UNIQUE (user_id, course_version_id),
    CONSTRAINT uq_course_enrollment_id_user UNIQUE (id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_status_recent
    ON course_enrollments(user_id, status, last_accessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_course_lessons_version_unit_position
    ON course_lessons(course_version_id, unit_id, position);

CREATE INDEX IF NOT EXISTS idx_learning_objectives_version_position
    ON learning_objectives(course_version_id, position);

CREATE INDEX IF NOT EXISTS idx_lesson_prerequisites_reverse
    ON lesson_prerequisites(prerequisite_lesson_id);

CREATE INDEX IF NOT EXISTS idx_objective_vocabulary_word
    ON learning_objective_vocabulary(vocabulary_word_id);

CREATE INDEX IF NOT EXISTS idx_objective_sentences_sentence
    ON learning_objective_sentences(context_sentence_id);

-- Editor capability is set by a future authenticated content-management use case.
-- This GUC is not an authorization substitute: the backend must verify the editor role.
CREATE OR REPLACE FUNCTION app_is_content_editor()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(current_setting('app.content_editor', TRUE), 'false') = 'true'
$$;

ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses FORCE ROW LEVEL SECURITY;
CREATE POLICY courses_published_read ON courses
    FOR SELECT USING (
        app_is_content_editor()
        OR EXISTS (
            SELECT 1 FROM course_versions cv
            WHERE cv.course_id = courses.id
        )
    );
CREATE POLICY courses_editor_write ON courses
    FOR ALL USING (app_is_content_editor())
    WITH CHECK (app_is_content_editor());

ALTER TABLE course_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY course_versions_published_or_enrolled_read ON course_versions
    FOR SELECT USING (
        status = 'published'
        OR EXISTS (
            SELECT 1
            FROM course_enrollments enrollment
            WHERE enrollment.course_version_id = course_versions.id
              AND enrollment.user_id =
                  NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
        )
    );
CREATE POLICY course_versions_editor_write ON course_versions
    FOR ALL USING (app_is_content_editor())
    WITH CHECK (app_is_content_editor());

DO $$
DECLARE
    table_name TEXT;
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
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM course_versions cv
                    WHERE cv.id = %I.course_version_id
                )
            )',
            table_name || '_published_or_enrolled_read',
            table_name,
            table_name
        );
        EXECUTE format(
            'CREATE POLICY %I ON %I FOR ALL USING (app_is_content_editor())
             WITH CHECK (app_is_content_editor())',
            table_name || '_editor_write',
            table_name
        );
    END LOOP;
END
$$;

ALTER TABLE course_version_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_version_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY course_version_reviews_editor_only ON course_version_reviews
    FOR ALL USING (app_is_content_editor())
    WITH CHECK (app_is_content_editor());

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_enrollments FORCE ROW LEVEL SECURITY;
CREATE POLICY course_enrollments_user_isolation ON course_enrollments
    FOR ALL
    USING (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    )
    WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', TRUE), '')::UUID
    );

CREATE OR REPLACE FUNCTION guard_course_version_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'draft' THEN
            RAISE EXCEPTION 'A curriculum version must be created as draft'
                USING ERRCODE = '55000';
        END IF;
        -- Serialize version creation with changes to the stable course slug/track.
        PERFORM id
        FROM courses
        WHERE id = NEW.course_id
        FOR UPDATE;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('published', 'archived') THEN
            RAISE EXCEPTION 'Published curriculum versions cannot be deleted'
                USING ERRCODE = '55000';
        END IF;
        RETURN OLD;
    END IF;

    IF OLD.status IN ('published', 'archived') THEN
        IF OLD.status = 'published' AND NEW.status NOT IN ('published', 'archived') THEN
            RAISE EXCEPTION 'A published curriculum version can only be archived'
                USING ERRCODE = '55000';
        END IF;
        IF OLD.status = 'archived' AND NEW.status <> 'archived' THEN
            RAISE EXCEPTION 'Archived curriculum versions are immutable'
                USING ERRCODE = '55000';
        END IF;
        IF (to_jsonb(NEW) - 'status' - 'archived_at' - 'updated_at' - 'created_by' - 'reviewed_by')
           IS DISTINCT FROM
           (to_jsonb(OLD) - 'status' - 'archived_at' - 'updated_at' - 'created_by' - 'reviewed_by')
           OR (NEW.created_by IS NOT NULL AND NEW.created_by IS DISTINCT FROM OLD.created_by)
           OR (NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by)
           OR (OLD.status = 'archived' AND NEW.archived_at IS DISTINCT FROM OLD.archived_at) THEN
            RAISE EXCEPTION 'Published curriculum content is immutable; create a new version'
                USING ERRCODE = '55000';
        END IF;
    ELSIF OLD.status = 'draft' AND NEW.status NOT IN ('draft', 'review') THEN
        RAISE EXCEPTION 'A draft must enter review before publication'
            USING ERRCODE = '55000';
    ELSIF OLD.status = 'review' AND NEW.status = 'review' THEN
        IF (to_jsonb(NEW) - 'updated_at') IS DISTINCT FROM
           (to_jsonb(OLD) - 'updated_at') THEN
            RAISE EXCEPTION 'A version under editorial review is frozen; return it to draft before editing'
                USING ERRCODE = '55000';
        END IF;
    ELSIF OLD.status = 'review' AND NEW.status NOT IN ('draft', 'published') THEN
        RAISE EXCEPTION 'Invalid curriculum review transition'
            USING ERRCODE = '55000';
    END IF;

    IF NEW.status = 'published' AND OLD.status <> 'published' THEN
        IF (to_jsonb(NEW) - 'status' - 'published_at' - 'updated_at' - 'reviewed_by')
           IS DISTINCT FROM
           (to_jsonb(OLD) - 'status' - 'published_at' - 'updated_at' - 'reviewed_by') THEN
            RAISE EXCEPTION 'Submitted curriculum metadata cannot change during publication'
                USING ERRCODE = '55000';
        END IF;

        IF NEW.reviewed_by IS NULL OR NEW.published_at IS NULL OR NOT EXISTS (
            SELECT 1
            FROM (
                SELECT reviewer_id, decision
                FROM course_version_reviews
                WHERE course_version_id = NEW.id
                ORDER BY reviewed_at DESC, id DESC
                LIMIT 1
            ) latest_review
            WHERE latest_review.reviewer_id = NEW.reviewed_by
              AND latest_review.decision = 'approved'
        ) THEN
            RAISE EXCEPTION 'Publication requires an approved review by the recorded reviewer'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END
$$;

CREATE TRIGGER trg_course_version_lifecycle
    BEFORE INSERT OR UPDATE OR DELETE ON course_versions
    FOR EACH ROW EXECUTE FUNCTION guard_course_version_lifecycle();

CREATE OR REPLACE FUNCTION guard_curriculum_child_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    version_status VARCHAR(12);
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO version_status
        FROM course_versions
        WHERE id = OLD.course_version_id
        FOR UPDATE;

        IF version_status IS DISTINCT FROM 'draft' THEN
            RAISE EXCEPTION 'Curriculum child records can only be changed while their version is draft'
                USING ERRCODE = '55000';
        END IF;
        RETURN OLD;
    END IF;

    -- Lock both versions in a stable order when an UPDATE moves a row. This
    -- serializes child edits with the parent transition to review/published.
    IF TG_OP = 'UPDATE' AND OLD.course_version_id IS DISTINCT FROM NEW.course_version_id THEN
        PERFORM id
        FROM course_versions
        WHERE id IN (OLD.course_version_id, NEW.course_version_id)
        ORDER BY id
        FOR UPDATE;

        SELECT status INTO version_status
        FROM course_versions
        WHERE id = OLD.course_version_id;
        IF version_status IS DISTINCT FROM 'draft' THEN
            RAISE EXCEPTION 'Published curriculum rows cannot be moved to another version'
                USING ERRCODE = '55000';
        END IF;
    END IF;

    SELECT status INTO version_status
    FROM course_versions
    WHERE id = NEW.course_version_id
    FOR UPDATE;

    IF version_status IS DISTINCT FROM 'draft' THEN
        RAISE EXCEPTION 'Curriculum child records can only be changed while their version is draft'
            USING ERRCODE = '55000';
    END IF;

    RETURN NEW;
END
$$;

DO $$
DECLARE
    table_name TEXT;
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
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I
             FOR EACH ROW EXECUTE FUNCTION guard_curriculum_child_write()',
            'trg_' || table_name || '_draft_only',
            table_name
        );
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION guard_course_enrollment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.course_version_id IS DISTINCT FROM OLD.course_version_id THEN
        RAISE EXCEPTION 'An enrollment cannot change its owner or pinned curriculum version'
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_course_enrollment_identity
    BEFORE UPDATE OF user_id, course_version_id ON course_enrollments
    FOR EACH ROW EXECUTE FUNCTION guard_course_enrollment_identity();

CREATE OR REPLACE FUNCTION require_published_course_for_enrollment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    version_status VARCHAR(12);
BEGIN
    SELECT status INTO version_status
    FROM course_versions
    WHERE id = NEW.course_version_id
    FOR SHARE;

    IF version_status IS DISTINCT FROM 'published' THEN
        RAISE EXCEPTION 'A new enrollment requires a published course version'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER trg_course_enrollment_published_version
    BEFORE INSERT ON course_enrollments
    FOR EACH ROW EXECUTE FUNCTION require_published_course_for_enrollment();

COMMENT ON TABLE courses IS 'Stable identity of a learning track; pedagogical content belongs to immutable versions.';
COMMENT ON TABLE course_versions IS 'Versioned curriculum aggregate with draft/review/published/archived lifecycle.';
COMMENT ON TABLE course_enrollments IS 'Private user enrollment pinned to one exact published course version.';
COMMENT ON TABLE learning_objective_skills IS 'A learning objective can produce separate evidence for multiple skills.';
COMMENT ON TABLE lesson_prerequisites IS 'Prerequisite graph within one course version; import validation must reject cycles.';
COMMENT ON COLUMN course_versions.cefr_level IS 'Canonical codes use PRE_A1; A0 is only a UI alias, not a separate CEFR level.';
COMMENT ON COLUMN course_enrollments.course_version_id IS 'Pinned version prevents later publication from silently changing the enrolled curriculum.';
