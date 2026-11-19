# Fase 1.2 — Validación operativa de modelo y migraciones

## Estado

El modelo y la migración curricular están integrados en `main`. La migración `20261117000000_curriculum_catalog.sql` forma parte de la secuencia desplegada en la VM. CI ya valida el esquema desde una base vacía, la actualización desde la secuencia anterior, las restricciones y el aislamiento RLS.

**La subfase 1.2 todavía no se declara cerrada.** El roadmap conserva dos criterios operativos pendientes:

1. Medir los planes de consulta/índices con datos representativos en staging.
2. Verificar la migración sobre una copia restaurada de un backup anterior a Fase 1.2.

El despliegue en producción no sustituye esas evidencias. Como la migración ya fue desplegada, la comprobación ex ante solo puede acreditarse si existe un backup anterior a la migración. No se debe volver a ejecutar la migración sobre una copia que ya contenga `courses` o `course_versions`.

## 1. Aplicación sobre backup restaurado

### Preparación

1. Selecciona un backup PostgreSQL tomado antes de aplicar `20261117000000_curriculum_catalog.sql`.
2. Restáuralo en una base aislada con nombre que incluya `restore`, por ejemplo `devfluency_phase12_restore`.
3. No reutilices la URL de producción ni ejecutes esta prueba en la base activa.
4. La cuenta de conexión debe poder crear los objetos del esquema curricular.

### Ejecución

Desde la raíz del repositorio:

```bash
RESTORE_TEST_DATABASE_URL='postgresql://…' \
RESTORE_TEST_EXPECTED_DB_NAME='devfluency_phase12_restore' \
RESTORE_TEST_CONFIRMATION='APPLY_PHASE1_2_TO_RESTORED_PRE_PHASE1_2_BACKUP' \
  bash scripts/test-phase1-2-restored-db.sh
```

El script verifica que la base destino sea la indicada, que contenga las tablas previas necesarias y que no tenga ya el esquema curricular. Aplica únicamente la migración 1.2 dentro de una transacción, valida tablas, índices, RLS forzado, competencias y triggers, y compara los conteos de `users`, `vocabulary_words` y `context_sentences` antes/después.

Si el backup ya contiene `courses` o `course_versions`, el script se detiene sin modificarlo. No intenta hacer la migración idempotente artificialmente.

## 2. Medición de planes con datos representativos en staging

### Requisitos

- Staging debe ser una copia aislada y tener el esquema actual aplicado.
- La base debe contener cursos publicados, unidades, lecciones, objetivos, competencias y matrículas suficientes para reflejar el volumen que se espera consultar.
- Se necesita un usuario estudiante real de prueba con matrícula en una versión publicada.
- Ejecutar con el rol runtime de staging, sin atributos `SUPERUSER` ni `BYPASSRLS`, para que la medición respete RLS.

### Ejecución

```bash
STAGING_DATABASE_URL='postgresql://…' \
STAGING_EXPECTED_DB_NAME='devfluency_staging' \
STAGING_STUDENT_USER_ID='<UUID_ESTUDIANTE_STAGING>' \
STAGING_COURSE_VERSION_ID='<UUID_VERSION_PUBLICADA_MATRICULADA>' \
STAGING_CONFIRMATION='READ_ONLY_EXPLAIN_ON_STAGING_COPY' \
  bash scripts/phase1-2-query-plans.sh
```

El informe contiene diez consultas alineadas con el SQL de `content-vocabulary-service`: conteo y página del catálogo, búsqueda parcial, versiones publicadas por nivel, unidades, lecciones, objetivos/competencias, prerrequisitos, evidencia por objetivo y matrículas recientes.

Se ejecutan `EXPLAIN (ANALYZE, BUFFERS, SETTINGS)` sobre consultas de lectura dentro de una transacción; al final se hace `ROLLBACK`. El fichero de salida se guarda en `/tmp/phase1-2-query-plans-*.txt` por defecto. Se puede cambiar con `PHASE12_QUERY_PLAN_OUTPUT`.

## 3. Decisión sobre índices

No se deben añadir índices únicamente porque figuren en el modelo lógico. Revisar los planes y registrar:

- Plan elegido (Index Scan, Bitmap Heap Scan, Seq Scan, joins y ordenamiento).
- Filas estimadas frente a filas reales.
- Buffers leídos/alcanzados y tiempo de ejecución.
- Si el filtro y el ordenamiento coinciden con el prefijo del índice.
- Coste de escritura/almacenamiento de cualquier índice adicional.

La búsqueda con `ILIKE '%texto%'` se mide explícitamente. No se añade GIN/trigram sin verificar primero volumen, selectividad, extensión disponible y coste en las escrituras.

No hay umbrales de latencia inventados en esta subfase. Los resultados deben conservarse como artefacto de aceptación y compararse con la volumetría real acordada.

## 4. Evidencia que falta para cerrar 1.2

- [ ] Ejecutar `test-phase1-2-restored-db.sh` contra una restauración pre-1.2 y conservar la salida PASS.
- [ ] Ejecutar `phase1-2-query-plans.sh` en staging con datos representativos y conservar el informe.
- [ ] Documentar los planes observados y cualquier ajuste de índices aprobado.
- [ ] Actualizar el roadmap con la referencia a ambas evidencias.

Hasta entonces, 1.2 está implementada e integrada, pero conserva el estado de validación operativa pendiente.
