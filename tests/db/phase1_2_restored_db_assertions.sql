DO $$
DECLARE
    table_name TEXT;
    required_tables TEXT[] := ARRAY[
        'courses',
        'course_versions',
        'course_units',
        'course_lessons',
        'learning_skills',
        'learning_objectives',
        'learning_objective_skills',
        'lesson_learning_objectives',
        'lesson_prerequisites',
        'learning_objective_vocabulary',
        'learning_objective_sentences',
        'course_version_reviews',
        'course_enrollments'
    ];
    protected_tables TEXT[] := ARRAY[
        'courses',
        'course_versions',
        'course_units',
        'course_lessons',
        'learning_objectives',
        'learning_objective_skills',
        'lesson_learning_objectives',
        'lesson_prerequisites',
        'learning_objective_vocabulary',
        'learning_objective_sentences',
        'course_version_reviews',
        'course_enrollments'
    ];
    required_indexes TEXT[] := ARRAY[
        'uq_course_level_one_published_version',
        'idx_course_versions_published_level',
        'idx_course_enrollments_user_status_recent',
        'idx_course_lessons_version_unit_position',
        'idx_learning_objectives_version_position',
        'idx_lesson_prerequisites_reverse',
        'idx_objective_vocabulary_word',
        'idx_objective_sentences_sentence'
    ];
    skill_count BIGINT;
    missing_rls_count BIGINT;
    missing_index_count BIGINT;
BEGIN
    FOREACH table_name IN ARRAY required_tables LOOP
        IF to_regclass(format('public.%I', table_name)) IS NULL THEN
            RAISE EXCEPTION 'Missing curriculum table after migration: %', table_name;
        END IF;
    END LOOP;

    SELECT count(*)
      INTO missing_rls_count
      FROM unnest(protected_tables) AS expected(table_name)
      LEFT JOIN pg_class relation
        ON relation.oid = to_regclass(format('public.%I', expected.table_name))
     WHERE relation.oid IS NULL
        OR NOT relation.relrowsecurity
        OR NOT relation.relforcerowsecurity;

    IF missing_rls_count <> 0 THEN
        RAISE EXCEPTION 'RLS is not enabled and forced on % curriculum tables', missing_rls_count;
    END IF;

    SELECT count(*)
      INTO missing_index_count
      FROM unnest(required_indexes) AS expected(index_name)
      LEFT JOIN pg_class relation
        ON relation.relname = expected.index_name
       AND relation.relkind = 'i'
     WHERE relation.oid IS NULL;

    IF missing_index_count <> 0 THEN
        RAISE EXCEPTION 'Missing expected curriculum indexes: %', missing_index_count;
    END IF;

    SELECT count(*) INTO skill_count FROM public.learning_skills;
    IF skill_count <> 9 THEN
        RAISE EXCEPTION 'Expected nine canonical learning skills, found %', skill_count;
    END IF;

    IF to_regprocedure('public.guard_course_version_lifecycle()') IS NULL
       OR to_regprocedure('public.guard_curriculum_child_write()') IS NULL
       OR to_regprocedure('public.guard_course_enrollment_identity()') IS NULL
       OR to_regprocedure('public.require_published_course_for_enrollment()') IS NULL THEN
        RAISE EXCEPTION 'One or more curriculum lifecycle/immutability guards are missing';
    END IF;
END
$$;

SELECT
    'phase1_2_schema_validation_passed' AS result,
    current_database() AS database_name,
    current_timestamp AS checked_at;
