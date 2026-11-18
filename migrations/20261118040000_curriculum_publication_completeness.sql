-- Fase 1.3: enforce academic completeness at the database publication boundary.
-- The offline validator and importer already enforce these rules, but publication
-- must remain safe when content is written through another trusted database path.

CREATE OR REPLACE FUNCTION assert_course_version_publishable(p_course_version_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION guard_course_version_publication_completeness()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $function$
BEGIN
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' THEN
        PERFORM assert_course_version_publishable(NEW.id);
    END IF;
    RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS trg_course_version_publication_completeness ON course_versions;
CREATE TRIGGER trg_course_version_publication_completeness
    BEFORE UPDATE OF status ON course_versions
    FOR EACH ROW
    EXECUTE FUNCTION guard_course_version_publication_completeness();

COMMENT ON FUNCTION assert_course_version_publishable(UUID) IS
    'Rejects publication unless every unit has a lesson, every lesson has a required objective with success criteria, every objective is linked and has exactly one primary skill.';


-- A review decision must describe the exact child content that will be published.
-- Lock the parent version while checking its state so child mutations cannot race
-- a transition into review/publication.
CREATE OR REPLACE FUNCTION guard_course_version_content_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    v_course_version_id UUID;
    v_version_status VARCHAR(12);
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.course_version_id IS DISTINCT FROM OLD.course_version_id THEN
        RAISE EXCEPTION 'Curriculum content cannot be moved between course versions'
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_course_version_id := OLD.course_version_id;
    ELSE
        v_course_version_id := NEW.course_version_id;
    END IF;

    SELECT version.status
      INTO v_version_status
      FROM public.course_versions AS version
     WHERE version.id = v_course_version_id
     FOR UPDATE;

    IF v_version_status IN ('review', 'published', 'archived') THEN
        RAISE EXCEPTION 'Curriculum content is frozen while its course version is under review or published; return it to draft before editing'
            USING ERRCODE = '55000';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END
$$;

DO $$
DECLARE
    child_table TEXT;
BEGIN
    FOREACH child_table IN ARRAY ARRAY[
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
            'DROP TRIGGER IF EXISTS %I ON public.%I',
            'trg_guard_course_version_content_mutation',
            child_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I
             BEFORE INSERT OR UPDATE OR DELETE ON public.%I
             FOR EACH ROW
             EXECUTE FUNCTION public.guard_course_version_content_mutation()',
            'trg_guard_course_version_content_mutation',
            child_table
        );
    END LOOP;
END
$$;

COMMENT ON FUNCTION guard_course_version_content_mutation() IS
    'Allows child content changes only while the parent course version is draft; review, published and archived versions are frozen.';
