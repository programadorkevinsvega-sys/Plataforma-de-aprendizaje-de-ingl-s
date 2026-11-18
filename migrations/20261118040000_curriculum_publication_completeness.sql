-- Fase 1.3: enforce academic completeness at the database publication boundary.
-- The offline validator and importer already enforce these rules, but publication
-- must remain safe when content is written through another trusted database path.

CREATE OR REPLACE FUNCTION assert_course_version_publishable(p_course_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM course_units
         WHERE course_version_id = p_course_version_id
    ) THEN
        RAISE EXCEPTION 'A curriculum version must contain at least one unit before publication'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM course_lessons
         WHERE course_version_id = p_course_version_id
    ) THEN
        RAISE EXCEPTION 'A curriculum version must contain at least one lesson before publication'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM learning_objectives
         WHERE course_version_id = p_course_version_id
    ) THEN
        RAISE EXCEPTION 'A curriculum version must contain at least one learning objective before publication'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM course_units AS unit
         WHERE unit.course_version_id = p_course_version_id
           AND NOT EXISTS (
               SELECT 1
                 FROM course_lessons AS lesson
                WHERE lesson.course_version_id = unit.course_version_id
                  AND lesson.unit_id = unit.id
           )
    ) THEN
        RAISE EXCEPTION 'Every curriculum unit must contain at least one lesson before publication'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM course_lessons AS lesson
         WHERE lesson.course_version_id = p_course_version_id
           AND NOT EXISTS (
               SELECT 1
                 FROM lesson_learning_objectives AS link
                 JOIN learning_objectives AS objective
                   ON objective.id = link.learning_objective_id
                  AND objective.course_version_id = link.course_version_id
                WHERE link.course_version_id = p_course_version_id
                  AND link.lesson_id = lesson.id
                  AND link.is_required = TRUE
                  AND length(btrim(objective.success_criteria)) > 0
           )
    ) THEN
        RAISE EXCEPTION 'Every lesson must have at least one required learning objective with non-empty success criteria before publication'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM learning_objectives AS objective
         WHERE objective.course_version_id = p_course_version_id
           AND NOT EXISTS (
               SELECT 1
                 FROM lesson_learning_objectives AS link
                WHERE link.course_version_id = p_course_version_id
                  AND link.learning_objective_id = objective.id
           )
    ) THEN
        RAISE EXCEPTION 'Every learning objective must be linked to at least one lesson before publication'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT objective.id
          FROM learning_objectives AS objective
          LEFT JOIN learning_objective_skills AS skill
            ON skill.learning_objective_id = objective.id
           AND skill.course_version_id = objective.course_version_id
         WHERE objective.course_version_id = p_course_version_id
         GROUP BY objective.id
        HAVING count(skill.skill_code) FILTER (WHERE skill.is_primary = TRUE) <> 1
    ) THEN
        RAISE EXCEPTION 'Every learning objective must have exactly one primary skill before publication'
            USING ERRCODE = '23514';
    END IF;
END
$$;

CREATE OR REPLACE FUNCTION guard_course_version_publication_completeness()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
        PERFORM assert_course_version_publishable(NEW.id);
    END IF;
    RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_course_version_publication_completeness ON course_versions;
CREATE TRIGGER trg_course_version_publication_completeness
    BEFORE UPDATE OF status ON course_versions
    FOR EACH ROW
    EXECUTE FUNCTION guard_course_version_publication_completeness();

COMMENT ON FUNCTION assert_course_version_publishable(UUID) IS
    'Rejects publication unless every unit has a lesson, every lesson has a required objective with success criteria, every objective is linked and has exactly one primary skill.';
