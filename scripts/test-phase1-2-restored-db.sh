#!/usr/bin/env bash
set -Eeuo pipefail

: "${RESTORE_TEST_DATABASE_URL:?RESTORE_TEST_DATABASE_URL es obligatorio}"
: "${RESTORE_TEST_EXPECTED_DB_NAME:?RESTORE_TEST_EXPECTED_DB_NAME es obligatorio}"

if [[ "${RESTORE_TEST_CONFIRMATION:-}" != "APPLY_PHASE1_2_TO_RESTORED_PRE_PHASE1_2_BACKUP" ]]; then
  echo "ERROR: esta operación modifica el esquema de una copia restaurada." >&2
  echo "Define RESTORE_TEST_CONFIRMATION=APPLY_PHASE1_2_TO_RESTORED_PRE_PHASE1_2_BACKUP." >&2
  exit 2
fi

if [[ "${RESTORE_TEST_EXPECTED_DB_NAME,,}" != *restore* ]]; then
  echo "ERROR: usa un nombre de base de datos de prueba que incluya 'restore'." >&2
  exit 2
fi

psql_bin="${PSQL_BIN:-psql}"
command -v "$psql_bin" >/dev/null 2>&1 || {
  echo "ERROR: no se encontró psql." >&2
  exit 127
}

psql() {
  "$psql_bin" "$RESTORE_TEST_DATABASE_URL" --no-psqlrc --set=ON_ERROR_STOP=1 "$@"
}

actual_db_name="$(psql --tuples-only --no-align --command='SELECT current_database()')"
if [[ "$actual_db_name" != "$RESTORE_TEST_EXPECTED_DB_NAME" ]]; then
  echo "ERROR: se esperaba $RESTORE_TEST_EXPECTED_DB_NAME y la conexión llegó a $actual_db_name." >&2
  exit 2
fi

echo "Destino confirmado: $actual_db_name"
echo "No se imprimirá la URL de conexión."

for table in users vocabulary_words context_sentences; do
  exists="$(psql --tuples-only --no-align --command="SELECT to_regclass('public.$table') IS NOT NULL")"
  if [[ "$exists" != "t" ]]; then
    echo "ERROR: el backup no contiene la tabla base public.$table." >&2
    exit 2
  fi
done

uuid_function="$(psql --tuples-only --no-align --command="SELECT to_regprocedure('uuid_generate_v4()') IS NOT NULL")"
if [[ "$uuid_function" != "t" ]]; then
  echo "ERROR: el backup no contiene uuid_generate_v4(); no es el baseline esperado." >&2
  exit 2
fi

curriculum_exists="$(psql --tuples-only --no-align --command="SELECT to_regclass('public.courses') IS NOT NULL OR to_regclass('public.course_versions') IS NOT NULL")"
if [[ "$curriculum_exists" == "t" ]]; then
  echo "ERROR: esta copia ya tiene el esquema curricular. Restaura una copia PRE-Fase 1.2; no vuelvas a aplicar la migración." >&2
  exit 2
fi

declare -A before_counts
for table in users vocabulary_words context_sentences; do
  before_counts["$table"]="$(psql --tuples-only --no-align --command="SELECT count(*) FROM public.$table")"
done

echo "Aplicando únicamente migrations/20261117000000_curriculum_catalog.sql en una transacción."
psql --single-transaction --file migrations/20261117000000_curriculum_catalog.sql

echo "Comprobando tablas, índices, RLS forzado, nueve competencias y triggers."
psql --file tests/db/phase1_2_restored_db_assertions.sql

for table in users vocabulary_words context_sentences; do
  after_count="$(psql --tuples-only --no-align --command="SELECT count(*) FROM public.$table")"
  if [[ "$after_count" != "${before_counts[$table]}" ]]; then
    echo "ERROR: la migración alteró el número de filas de public.$table (antes ${before_counts[$table]}, después $after_count)." >&2
    exit 1
  fi
done

echo "PASS: migración 1.2 aplicada a la copia restaurada; las tablas legadas conservaron sus conteos."
echo "La base de datos de restauración ahora contiene el esquema de Fase 1.2. No es producción."
