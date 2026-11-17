#!/usr/bin/env bash
set -Eeuo pipefail

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is required}"
migration="migrations/20261117000000_curriculum_catalog.sql"
assertions="tests/db/phase1_2_curriculum_assertions.sql"
[[ -s "$migration" ]] || { echo "Missing curriculum migration: $migration" >&2; exit 1; }
[[ -s "$assertions" ]] || { echo "Missing curriculum schema assertions: $assertions" >&2; exit 1; }

# TEST_DATABASE_URL is a new database. Reconstruct the known existing schema
# separately, then apply only the new migration to that baseline.
upgrade_database_url="${TEST_DATABASE_URL%/*}/devfluency_upgrade"
createdb --maintenance-db="$TEST_DATABASE_URL" devfluency_upgrade

echo "Applying complete migration history to an empty database."
for file in migrations/*.sql; do
  psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file "$file"
done

echo "Reconstructing the existing schema, then applying only the new migration."
for file in migrations/*.sql; do
  [[ "$file" == "$migration" ]] && continue
  psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$file"
done
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$migration"

echo "Checking the fresh database."
psql "$TEST_DATABASE_URL" --set ON_ERROR_STOP=1 --file "$assertions"
echo "Checking the upgraded database."
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$assertions"

echo "Phase 1.2 migration tests passed for fresh and upgraded schemas."
