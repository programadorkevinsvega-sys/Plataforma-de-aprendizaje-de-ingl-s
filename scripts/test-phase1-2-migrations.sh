#!/usr/bin/env bash
set -Eeuo pipefail

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is required}"
curriculum_migration="migrations/20261117000000_curriculum_catalog.sql"
importer_migration="migrations/20261118000000_curriculum_content_package_imports.sql"
export_visibility_migration="migrations/20261118010000_curriculum_package_export_visibility.sql"
editor_registry_migration="migrations/20261118020000_curriculum_content_editors.sql"
review_order_migration="migrations/20261118030000_curriculum_review_order.sql"
publication_integrity_migration="migrations/20261118040000_curriculum_publication_completeness.sql"
lexical_catalog_migration="migrations/20261119000000_lexical_catalog_v2.sql"
draft_editor_migration="migrations/20261120010000_curriculum_draft_revisions.sql"
activity_assessment_migration="migrations/20261120020000_activity_attempt_results.sql"
curriculum_assertions="tests/db/phase1_2_curriculum_assertions.sql"
importer_assertions="tests/db/phase1_3_importer_assertions.sql"
lexical_catalog_assertions="tests/db/phase1_4_lexical_catalog_assertions.sql"
draft_editor_assertions="tests/db/phase1_5_draft_editor_assertions.sql"
activity_assessment_assertions="tests/db/phase2_3_activity_assessment_assertions.sql"
lesson_sessions_migration="migrations/20261121010000_lesson_sessions_and_activities.sql"
educational_feedback_migration="migrations/20261121020000_educational_feedback.sql"
lesson_sessions_assertions="tests/db/phase2_4_learning_sessions_assertions.sql"

for required_file in "$curriculum_migration" "$importer_migration" "$export_visibility_migration" "$editor_registry_migration" "$review_order_migration" "$publication_integrity_migration" "$lexical_catalog_migration" "$draft_editor_migration" "$activity_assessment_migration" "$lesson_sessions_migration" "$educational_feedback_migration" "$curriculum_assertions" "$importer_assertions" "$lexical_catalog_assertions" "$draft_editor_assertions" "$activity_assessment_assertions" "$lesson_sessions_assertions"; do
  [[ -s "$required_file" ]] || { echo "Missing curriculum migration/assertion: $required_file" >&2; exit 1; }
done

# Keep the integration-test database populated only with schema and migrations.
# Isolated databases verify both a complete install and the upgrade path from
# the schema immediately before the curriculum catalog was introduced.
database_prefix="${TEST_DATABASE_URL%/*}"
fresh_database_url="${database_prefix}/devfluency_fresh"
upgrade_database_url="${database_prefix}/devfluency_upgrade"

echo "Preparing complete schema for integration tests."
for file in migrations/*.sql; do
  echo "Applying $file to TEST_DATABASE_URL."
  psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file "$file"
done

echo "Creating isolated fresh-install and upgrade databases."
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --command="CREATE DATABASE devfluency_fresh"
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --command="CREATE DATABASE devfluency_upgrade"

echo "Applying complete migration history to a fresh database."
for file in migrations/*.sql; do
  psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$file"
done

echo "Reconstructing the pre-curriculum schema, then applying Fase 1.2 through 2.5 migrations."
for file in migrations/*.sql; do
  [[ "$file" == "$curriculum_migration" || "$file" == "$importer_migration" || "$file" == "$export_visibility_migration" || "$file" == "$editor_registry_migration" || "$file" == "$review_order_migration" || "$file" == "$publication_integrity_migration" || "$file" == "$lexical_catalog_migration" || "$file" == "$draft_editor_migration" || "$file" == "$activity_assessment_migration" || "$file" == "$lesson_sessions_migration" || "$file" == "$educational_feedback_migration" ]] && continue
  psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$file"
done
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$curriculum_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$importer_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$export_visibility_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$editor_registry_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$review_order_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$publication_integrity_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$lexical_catalog_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$draft_editor_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$activity_assessment_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$lesson_sessions_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$educational_feedback_migration"

echo "Checking the fresh database."
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$curriculum_assertions"
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$importer_assertions"
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$lexical_catalog_assertions"
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$draft_editor_assertions"
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$activity_assessment_assertions"
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$lesson_sessions_assertions"

echo "Checking the upgraded database."
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$curriculum_assertions"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$importer_assertions"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$lexical_catalog_assertions"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$draft_editor_assertions"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$activity_assessment_assertions"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$lesson_sessions_assertions"

echo "Phase 1.2 through 2.5 migration tests passed for fresh and upgraded schemas."
