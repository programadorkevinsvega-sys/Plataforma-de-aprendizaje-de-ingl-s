#!/usr/bin/env bash
set -Eeuo pipefail

: "${STAGING_DATABASE_URL:?STAGING_DATABASE_URL es obligatorio}"
: "${STAGING_EXPECTED_DB_NAME:?STAGING_EXPECTED_DB_NAME es obligatorio}"
: "${STAGING_STUDENT_USER_ID:?STAGING_STUDENT_USER_ID es obligatorio}"
: "${STAGING_COURSE_VERSION_ID:?STAGING_COURSE_VERSION_ID es obligatorio}"

if [[ "${STAGING_CONFIRMATION:-}" != "READ_ONLY_EXPLAIN_ON_STAGING_COPY" ]]; then
  echo "ERROR: confirma que el destino es una copia aislada de staging." >&2
  echo "Define STAGING_CONFIRMATION=READ_ONLY_EXPLAIN_ON_STAGING_COPY." >&2
  exit 2
fi

psql_bin="${PSQL_BIN:-psql}"
command -v "$psql_bin" >/dev/null 2>&1 || {
  echo "ERROR: no se encontró psql." >&2
  exit 127
}

output_path="${PHASE12_QUERY_PLAN_OUTPUT:-/tmp/phase1-2-query-plans-$(date -u +%Y%m%dT%H%M%SZ).txt}"
mkdir -p "$(dirname "$output_path")"

echo "Destino esperado: $STAGING_EXPECTED_DB_NAME"
echo "Versión curricular de muestra: $STAGING_COURSE_VERSION_ID"
echo "Los planes se guardarán en: $output_path"
echo "No se imprimirá la URL de conexión."

"$psql_bin" "$STAGING_DATABASE_URL" \
  --no-psqlrc \
  --set=ON_ERROR_STOP=1 \
  --set="expected_db_name=$STAGING_EXPECTED_DB_NAME" \
  --set="student_user_id=$STAGING_STUDENT_USER_ID" \
  --set="course_version_id=$STAGING_COURSE_VERSION_ID" \
  --file tests/db/phase1_2_query_plans.sql | tee "$output_path"

echo
echo "Planes completados. Conserva $output_path como evidencia de 1.2."
