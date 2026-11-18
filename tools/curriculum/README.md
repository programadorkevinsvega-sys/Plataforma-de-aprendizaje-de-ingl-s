# Fase 1.3 — Paquetes curriculares, validación e importación

Esta carpeta contiene el contrato canónico v1, el validador offline y el importador transaccional de paquetes curriculares.

## Contrato v1

El formato se define en [content-package.schema.json](content-package.schema.json). El ejemplo estructural está en `tests/fixtures/curriculum/phase1_3_content_package_v1.json`.

El paquete representa **una versión concreta de un curso**, no un conjunto de cambios libres sobre producción:

- `format` y `schema_version` identifican el formato de intercambio.
- `metadata` registra autor, fecha de autoría, fuente y licencia.
- `course` identifica la ruta estable mediante `slug` y `track_code`.
- `version` fija el número de versión, nivel, título y locale.
- `units` y `lessons` establecen estructura, orden, patrón y prerequisitos.
- `objectives` define resultados observables, criterios de éxito, competencias y referencias a vocabulario/frases existentes.

Los códigos de nivel admitidos son `PRE_A1`, `A1`, `A2`, `B1`, `B2`, `C1` y `C2`. `A0` es un alias de interfaz heredado y **no** es un nivel canónico del paquete ni de la persistencia curricular.

Los límites de longitud de las referencias se alinean con las columnas existentes de PostgreSQL: palabra hasta 100 caracteres y categoría hasta 50.

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

## Importación PostgreSQL

La importación resuelve referencias contra el catálogo existente y crea únicamente una versión curricular nueva en estado `draft`. No crea ni modifica vocabulario/frases, no publica contenido y no altera matrículas, tarjetas SRS ni progreso de estudiantes.

Primero se ejecuta la migración `20261118000000_curriculum_content_package_imports.sql` junto con el historial normal de migraciones. Luego, desde la raíz del repositorio:

    DATABASE_URL='postgresql://…' node tools/curriculum/import_content_package.mjs tests/fixtures/curriculum/phase1_3_content_package_v1.json

El modo predeterminado es **dry-run**. Se conecta a PostgreSQL, valida las referencias reales, intenta todas las inserciones dentro de una transacción y revierte la transacción al finalizar. Así comprueba claves foráneas, triggers, políticas RLS y restricciones sin persistir cambios.

Para guardar la versión nueva explícitamente:

    DATABASE_URL='postgresql://…' node tools/curriculum/import_content_package.mjs tests/fixtures/curriculum/phase1_3_content_package_v1.json --apply

El importador:

1. Reejecuta el validador offline y utiliza su SHA-256 canónico.
2. Serializa importaciones concurrentes por identidad estable del curso.
3. Resuelve cada palabra por `word + category` y cada frase por `word + english_text`; las referencias ausentes o ambiguas abortan toda la transacción.
4. Inserta cursos/rutas si no existen, y una versión nueva siempre en estado `draft`.
5. Inserta unidades, lecciones, objetivos, skills, vínculos, prerequisitos y referencias existentes.
6. Registra formato, versión de esquema, SHA-256 y metadatos de procedencia.
7. Trata una repetición con el mismo hash como no-op idempotente.
8. Rechaza contenido diferente para la misma versión; se debe incrementar `version_number`, nunca sobrescribirla.

`DATABASE_URL` debe pertenecer a una conexión administrativa confiable y no debe exponerse a través de una API o al frontend. El contexto `app.content_editor` utilizado por el CLI satisface las políticas RLS para esta operación administrativa; no es un mecanismo de autorización de usuarios finales. El CLI no imprime la URL ni credenciales.

## Pruebas

Las pruebas unitarias/estructurales:

    python3 -m unittest discover -s tools/curriculum/tests -p 'test_*.py' -v

Las pruebas de integración del importador requieren un PostgreSQL aislado con todas las migraciones aplicadas y `DATABASE_URL` configurada:

    node --test tools/curriculum/tests/import_content_package.test.mjs

CI prepara una base PostgreSQL efímera, valida migraciones desde cero y desde el esquema anterior, y ejecuta pruebas para importación, rollback, referencias faltantes, idempotencia, no sobrescritura y concurrencia.

## Límites de esta entrega

- El importador no crea vocabulario ni frases. Esos registros deben existir y ser únicos en el catálogo legado antes de que el paquete los referencie.
- La importación no cambia el estado de `draft`; la revisión y publicación son operaciones separadas.
- El ledger registra SHA-256 y metadatos de procedencia. La exportación relacional a un paquete canónico sigue pendiente.
- La revisión lingüística/editorial de traducciones, ejemplos, pronunciación y audio sigue pendiente.
- La coherencia entre objetivos y actividades/respuestas se cerrará cuando exista el contrato de actividades de Fase 2.

Las actividades, respuestas de ejercicios y sus evaluaciones no pertenecen a este contrato: se definirán en la Fase 2.
