\set ON_ERROR_STOP on
\echo '=== Fase 1.2 · EXPLAIN ANALYZE del catálogo curricular en staging ==='

SELECT current_database() = :'expected_db_name' AS db_name_matches \gset
\if :db_name_matches
  \echo 'Base de datos confirmada.'
\else
  \echo 'ERROR: la base conectada no coincide con STAGING_EXPECTED_DB_NAME.'
  \quit 3
\endif

SELECT (NOT role_info.rolsuper AND NOT role_info.rolbypassrls) AS safe_runtime_role
  FROM pg_roles role_info
 WHERE role_info.rolname = current_user \gset
\if :safe_runtime_role
  \echo 'Rol de conexión no es superusuario ni BYPASSRLS.'
\else
  \echo 'ERROR: usa el rol runtime de staging, sin SUPERUSER ni BYPASSRLS.'
  \quit 3
\endif

BEGIN;
SET TRANSACTION READ ONLY;
SELECT set_config('app.current_user_id', :'student_user_id', TRUE);
SET LOCAL track_io_timing = on;

SELECT EXISTS (
    SELECT 1
      FROM public.course_versions version
      JOIN public.course_enrollments enrollment
        ON enrollment.course_version_id = version.id
     WHERE version.id = :'course_version_id'::UUID
       AND version.status = 'published'
       AND enrollment.user_id = :'student_user_id'::UUID
) AS sample_version_available \gset
\if :sample_version_available
  \echo 'Versión publicada y matrícula del estudiante verificadas.'
\else
  \echo 'ERROR: el student_user_id debe tener matrícula activa en la versión publicada indicada.'
  \quit 3
\endif

\echo ''
\echo '--- QP-01 · Conteo del catálogo por ruta y nivel ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT COUNT(*)
  FROM courses course
  JOIN course_versions version ON version.course_id = course.id
 WHERE (
        version.status = 'published'
        OR EXISTS (
            SELECT 1
              FROM course_enrollments enrollment
             WHERE enrollment.course_version_id = version.id
               AND enrollment.user_id = :'student_user_id'::UUID
        )
 )
   AND course.track_code = 'general'
   AND version.cefr_level = 'A1'
   AND (
        NOT FALSE
        OR EXISTS (
            SELECT 1
              FROM course_enrollments enrollment
             WHERE enrollment.course_version_id = version.id
               AND enrollment.user_id = :'student_user_id'::UUID
        )
   );

\echo ''
\echo '--- QP-02 · Página de catálogo con conteos de unidades/lecciones ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT
    course.slug,
    course.track_code,
    version.id,
    version.version_number,
    version.cefr_level,
    version.title,
    version.description,
    (SELECT COUNT(*)
       FROM course_units unit
      WHERE unit.course_version_id = version.id) AS unit_count,
    (SELECT COUNT(*)
       FROM course_lessons lesson
      WHERE lesson.course_version_id = version.id) AS lesson_count,
    (SELECT COALESCE(SUM(lesson.estimated_minutes), 0)
       FROM course_lessons lesson
      WHERE lesson.course_version_id = version.id) AS estimated_minutes,
    EXISTS (
        SELECT 1
          FROM course_enrollments enrollment
         WHERE enrollment.course_version_id = version.id
           AND enrollment.user_id = :'student_user_id'::UUID
    ) AS enrolled,
    version.status
  FROM courses course
  JOIN course_versions version ON version.course_id = course.id
 WHERE (
        version.status = 'published'
        OR EXISTS (
            SELECT 1
              FROM course_enrollments enrollment
             WHERE enrollment.course_version_id = version.id
               AND enrollment.user_id = :'student_user_id'::UUID
        )
 )
   AND course.track_code = 'general'
   AND version.cefr_level = 'A1'
   AND (NOT FALSE OR EXISTS (
        SELECT 1
          FROM course_enrollments enrollment
         WHERE enrollment.course_version_id = version.id
           AND enrollment.user_id = :'student_user_id'::UUID
   ))
 ORDER BY
    CASE course.track_code WHEN 'general' THEN 1 ELSE 2 END,
    CASE version.cefr_level
      WHEN 'PRE_A1' THEN 1 WHEN 'A1' THEN 2 WHEN 'A2' THEN 3
      WHEN 'B1' THEN 4 WHEN 'B2' THEN 5 WHEN 'C1' THEN 6 ELSE 7
    END,
    course.slug,
    version.version_number DESC
 LIMIT 12 OFFSET 0;

\echo ''
\echo '--- QP-03 · Búsqueda parcial del catálogo (slug/título/descripción) ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT version.id, course.slug, version.title
  FROM courses course
  JOIN course_versions version ON version.course_id = course.id
 WHERE version.status = 'published'
   AND (
        course.slug ILIKE '%intro%'
        OR version.title ILIKE '%intro%'
        OR version.description ILIKE '%intro%'
   )
 ORDER BY course.slug, version.cefr_level, version.version_number DESC
 LIMIT 12 OFFSET 0;

\echo ''
\echo '--- QP-04 · Versiones publicadas por nivel ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT id, course_id, version_number, title
  FROM course_versions
 WHERE status = 'published'
   AND cefr_level = 'A1'
 ORDER BY course_id
 LIMIT 50;

\echo ''
\echo '--- QP-05 · Unidades de una CourseVersion ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT id, position, title, theme, description, estimated_minutes
  FROM course_units
 WHERE course_version_id = :'course_version_id'::UUID
 ORDER BY position, id;

\echo ''
\echo '--- QP-06 · Lecciones de una CourseVersion ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT id, unit_id, lesson_code, position, lesson_pattern,
       title, description, estimated_minutes
  FROM course_lessons
 WHERE course_version_id = :'course_version_id'::UUID
 ORDER BY unit_id, position, id;

\echo ''
\echo '--- QP-07 · Objetivos de lecciones y competencias ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT
    link.lesson_id,
    objective.id,
    objective.objective_code,
    objective.description,
    objective.success_criteria,
    link.position,
    link.is_required,
    COALESCE(
        ARRAY_AGG(skill.skill_code::TEXT ORDER BY skill.skill_code)
            FILTER (WHERE skill.skill_code IS NOT NULL),
        ARRAY[]::TEXT[]
    )
  FROM lesson_learning_objectives link
  JOIN learning_objectives objective
    ON objective.id = link.learning_objective_id
   AND objective.course_version_id = link.course_version_id
  LEFT JOIN learning_objective_skills skill
    ON skill.learning_objective_id = objective.id
   AND skill.course_version_id = objective.course_version_id
 WHERE link.course_version_id = :'course_version_id'::UUID
 GROUP BY link.lesson_id, objective.id, objective.objective_code,
          objective.description, objective.success_criteria,
          link.position, link.is_required
 ORDER BY link.lesson_id, link.position;

\echo ''
\echo '--- QP-08 · Prerrequisitos de una CourseVersion ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT lesson_id, prerequisite_lesson_id, required_state,
       minimum_mastery_score
  FROM lesson_prerequisites
 WHERE course_version_id = :'course_version_id'::UUID
 ORDER BY lesson_id, prerequisite_lesson_id;

\echo ''
\echo '--- QP-09 · Evidencia de objetivos (vocabulario, SRS y dominio de práctica) ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT
    objective.id,
    (
        SELECT COUNT(*)
          FROM learning_objective_vocabulary reference
         WHERE reference.learning_objective_id = objective.id
    ) + (
        SELECT COUNT(*)
          FROM learning_objective_sentences reference
         WHERE reference.learning_objective_id = objective.id
    ) AS evidence_total,
    (
        SELECT COUNT(*)
          FROM learning_objective_vocabulary reference
          JOIN learning_progress_events event
            ON event.word_id = reference.vocabulary_word_id
           AND event.user_id = :'student_user_id'::UUID
         WHERE reference.learning_objective_id = objective.id
    ) + (
        SELECT COUNT(*)
          FROM learning_objective_sentences reference
          JOIN user_srs_progress review
            ON review.sentence_id = reference.context_sentence_id
           AND review.user_id = :'student_user_id'::UUID
           AND review.repetitions > 0
         WHERE reference.learning_objective_id = objective.id
    ) AS evidence_completed,
    CASE
      WHEN EXISTS (
          SELECT 1
            FROM learning_objective_sentences reference
           WHERE reference.learning_objective_id = objective.id
      )
      THEN COALESCE((
          SELECT AVG(LEAST(review.repetitions::DOUBLE PRECISION / 3.0, 1.0))
            FROM learning_objective_sentences reference
            LEFT JOIN user_srs_progress review
              ON review.sentence_id = reference.context_sentence_id
             AND review.user_id = :'student_user_id'::UUID
           WHERE reference.learning_objective_id = objective.id
      ), 0.0)
      ELSE 0.0
    END AS mastery_score
  FROM learning_objectives objective
 WHERE objective.course_version_id = :'course_version_id'::UUID;

\echo ''
\echo '--- QP-10 · Historial de matrículas recientes del estudiante ---'
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, SUMMARY, TIMING OFF)
SELECT id, course_version_id, status, started_at, last_accessed_at
  FROM course_enrollments
 WHERE user_id = :'student_user_id'::UUID
 ORDER BY status, last_accessed_at DESC
 LIMIT 20;

ROLLBACK;
\echo ''
\echo 'Fin de los planes. Las consultas fueron SELECT y la transacción se revirtió.'
