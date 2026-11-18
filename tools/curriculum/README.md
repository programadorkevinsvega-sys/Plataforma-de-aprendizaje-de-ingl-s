# Fase 1.3 — Paquetes curriculares y validación

Esta carpeta contiene el contrato canónico y el validador offline de paquetes curriculares.

## Contrato v1

El formato se define en [content-package.schema.json](content-package.schema.json). El ejemplo mínimo está en `tests/fixtures/curriculum/phase1_3_content_package_v1.json`.

El paquete representa **una versión concreta de un curso**, no un conjunto de cambios libres sobre producción:

- `format` y `schema_version` identifican el formato de intercambio.
- `metadata` registra autor, fecha de autoría, fuente y licencia.
- `course` identifica la ruta estable mediante `slug` y `track_code`.
- `version` fija el número de versión, nivel, título y locale.
- `units` y `lessons` establecen estructura, orden, patrón y prerequisitos.
- `objectives` define resultados observables, criterios de éxito, competencias y referencias a vocabulario/frases existentes.

Los códigos de nivel admitidos son `PRE_A1`, `A1`, `A2`, `B1`, `B2`, `C1` y `C2`. `A0` es un alias de interfaz heredado y **no** es un nivel canónico del paquete ni de la persistencia curricular.

## Validación offline

Desde la raíz del repositorio:

    python3 tools/curriculum/validate_content_package.py tests/fixtures/curriculum/phase1_3_content_package_v1.json
    python3 tools/curriculum/validate_content_package.py tests/fixtures/curriculum/phase1_3_content_package_v1.json --json
    python3 -m unittest discover -s tools/curriculum/tests -p 'test_*.py' -v

El validador no necesita dependencias externas y no se conecta a PostgreSQL. Verifica:

- Estructura estricta: campos requeridos, tipos, longitudes y rechazo de campos desconocidos.
- Identificadores y posiciones únicos dentro de su ámbito.
- Niveles CEFR y competencias permitidos.
- Referencias entre lecciones y objetivos; no admite objetivos huérfanos.
- Existencia de prerequisitos dentro del paquete y ausencia de ciclos.
- Un único skill primario por objetivo.
- Duplicados de referencias de vocabulario/frases y rangos válidos.
- Fecha de autoría ISO 8601 y claves JSON duplicadas.
- SHA-256 canónico que ignora espacios y orden de claves de objetos.

## Límites de esta entrega

La validación offline **no demuestra que las referencias existan en PostgreSQL**. Esa comprobación pertenece a la fase de importación contra la base de datos.

Este comando no inserta ni modifica cursos, vocabulario, frases, matrículas, progreso SRS ni historial de estudiantes. El futuro importador deberá:

1. Crear exclusivamente versiones nuevas en estado `draft`.
2. Comprobar referencias reales a vocabulario/frases.
3. Ser transaccional e idempotente.
4. Rechazar un paquete distinto si ya existe la misma versión; será necesario incrementar `version_number`.
5. No editar, publicar ni archivar versiones existentes. La revisión y publicación seguirán el ciclo editorial ya protegido por la base de datos.

Las actividades, respuestas de ejercicios y sus evaluaciones no pertenecen a este contrato: se definirán en la Fase 2.
