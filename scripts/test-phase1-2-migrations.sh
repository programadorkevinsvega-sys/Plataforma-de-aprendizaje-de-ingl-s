#!/usr/bin/env bash
set -Eeuo pipefail

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is required}"
curriculum_migration="migrations/20261117000000_curriculum_catalog.sql"
importer_migration="migrations/20261118000000_curriculum_content_package_imports.sql"
curriculum_assertions="tests/db/phase1_2_curriculum_assertions.sql"
importer_assertions="tests/db/phase1_3_importer_assertions.sql"

for required_file in "$curriculum_migration" "$importer_migration" "$curriculum_assertions" "$importer_assertions"; do
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

echo "Reconstructing the pre-curriculum schema, then applying Fase 1.2 and Fase 1.3 migrations."
for file in migrations/*.sql; do
  [[ "$file" == "$curriculum_migration" || "$file" == "$importer_migration" ]] && continue
  psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$file"
done
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$curriculum_migration"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$importer_migration"

echo "Checking the fresh database."
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$curriculum_assertions"
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$importer_assertions"

echo "Checking the upgraded database."
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$curriculum_assertions"
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$importer_assertions"

echo "Phase 1.2 and 1.3 migration tests passed for fresh and upgraded schemas."
