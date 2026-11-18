#!/usr/bin/env bash
set -Eeuo pipefail

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is required}"
migration="migrations/20261117000000_curriculum_catalog.sql"
assertions="tests/db/phase1_2_curriculum_assertions.sql"
[[ -s "$migration" ]] || { echo "Missing curriculum migration: $migration" >&2; exit 1; }
[[ -s "$assertions" ]] || { echo "Missing curriculum schema assertions: $assertions" >&2; exit 1; }

# Keep the Rust integration-test database free of fixture records. Apply the
# full schema to it, then use two isolated databases for the SQL assertions.
database_prefix="${TEST_DATABASE_URL%/*}"
fresh_database_url="${database_prefix}/devfluency_fresh"
upgrade_database_url="${database_prefix}/devfluency_upgrade"

echo "Preparing schema for Rust integration tests."
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

echo "Reconstructing the existing schema, then applying only the new migration."
for file in migrations/*.sql; do
  [[ "$file" == "$migration" ]] && continue
  psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$file"
done
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$migration"

echo "Checking the fresh database."
psql "$fresh_database_url" --set ON_ERROR_STOP=1 --file "$assertions"
echo "Checking the upgraded database."
psql "$upgrade_database_url" --set ON_ERROR_STOP=1 --file "$assertions"

echo "Phase 1.2 migration tests passed for fresh and upgraded schemas."
