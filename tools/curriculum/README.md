## Catálogo léxico v2 — fuente única

La fuente canónica de contenido léxico y comprensión es `crates/content-vocabulary-service/data/lexical_catalog.v2.json`. La taxonomía de 26 categorías está en `tools/curriculum/lexical-taxonomy.v1.json`.

No se mantienen colecciones separadas A0/A1 ni claves de categoría heredadas. Los niveles canónicos son `PRE_A1`, `A1`, `A2`, `B1`, `B2`, `C1` y `C2`. Cada unidad separa tipo léxico, ruta, prioridad pedagógica, utilidad, frecuencia de corpus, contextos, registro, ejemplos, pronunciación, revisión editorial y procedencia.

Auditoría y pruebas:
```bash
node tools/curriculum/audit_lexical_catalog.mjs --strict
node --test tools/curriculum/tests/lexical_catalog_audit.test.mjs
```

### Cruce de frecuencia NGSL / NGSL-Spoken

Los CSV se descargan desde las páginas oficiales [NGSL 1.2](https://www.newgeneralservicelist.com/new-general-service-list) y [NGSL-Spoken 1.2](https://www.newgeneralservicelist.com/ngsl-spoken). El script no descarga ni modifica datos externos: recibe ambos archivos locales y genera un informe auditable.

```bash
node tools/curriculum/match_lexical_frequency.mjs \
  --ngsl /ruta/NGSL_12_stats.csv \
  --ngsl-spoken /ruta/NGSL-Spoken_12_stats.csv

# Después de revisar el informe y confirmar las fuentes:
node tools/curriculum/match_lexical_frequency.mjs \
  --ngsl /ruta/NGSL_12_stats.csv \
  --ngsl-spoken /ruta/NGSL-Spoken_12_stats.csv \
  --apply
```

Solo se aceptan coincidencias exactas de lema modificado. Se registra hash SHA-256, atribución, licencia y URL. NGSL agrupa categorías gramaticales en sus lemas modificados; sus rangos no son frecuencias por sentido. Las expresiones multi-palabra se marcan `not_applicable_multiword` y no reciben rangos unigrama. La fase debe seguir marcada pendiente hasta ejecutar el cruce con los archivos oficiales íntegros y revisar el informe.

### Importación PostgreSQL v2

La migración `migrations/20261119000000_lexical_catalog_v2.sql` extiende las tablas léxicas existentes con metadatos v2, añade recursos de comprensión y un ledger SHA-256. Las filas heredadas se conservan como `legacy_pending_review`; no se exponen al estudiante. El servicio gRPC lista únicamente vocabulario y ejemplos cuyo estado sea `published`. El RPC `ListComprehensionResources` expone lecturas y escuchas publicadas con filtros de ruta, nivel y skill y paginación; exige autenticación y jamás devuelve borradores.

La importación usa `tools/curriculum/import_lexical_catalog.mjs`, es transaccional e idempotente. El modo predeterminado es dry-run y siempre revierte:
```bash
DATABASE_URL='postgresql://…' node tools/curriculum/import_lexical_catalog.mjs
```

Para persistir el catálogo como borrador se requiere un editor provisionado en `content_editors`:
```bash
DATABASE_URL='postgresql://…' node tools/curriculum/import_lexical_catalog.mjs --apply --actor-user-id <EDITOR_UUID>
```

El importador registra actor, hash, conteos y metadatos; no publica contenido. Rechaza modificar contenido previamente publicado. La publicación de una unidad exige revisión editorial aprobada y pronunciación aprobada o declarada explícitamente como no requerida. La publicación de un recurso listening requiere además un audio real con estado aprobado y URL registrada.

La importación y las migraciones v2 se prueban con `node --test tools/curriculum/tests/import_lexical_catalog.test.mjs` y el harness de migraciones de Fase 1.2–1.4. Los guiones de listening continúan en borrador sin audio; los ejemplos, traducciones, niveles y guías fonéticas continúan pendientes de revisión editorial competente. La presencia de la estructura y la auditoría estricta no equivale a aprobar la naturalidad del contenido.

---

# Fase 1.3 — Paquetes curriculares, validación, importación y revisión editorial

Esta carpeta contiene el contrato canónico v1, el validador offline, el importador transaccional, el exportador relacional y el CLI editorial de versiones curriculares.

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

Los límites de longitud de las referencias se alinean con las columnas existentes de PostgreSQL: palabra hasta 100 caracteres y categoría hasta 50. El hash SHA-256 trata `skills` y `prerequisites` como relaciones sin orden, pero conserva el orden explícito de cursos, unidades, lecciones, objetivos y referencias con posición.

## Autorización editorial

Importar, exportar y cambiar el ciclo editorial requiere una identidad registrada en `public.content_editors`. La migración `20261118020000_curriculum_content_editors.sql` hace que `app_is_content_editor()` compruebe esa tabla usando el `app.current_user_id` transaction-local; el GUC `app.content_editor` por sí solo ya no concede permisos.

Un administrador de base de datos provisiona los editores de forma explícita. Ejemplo, sustituyendo el correo por la cuenta real:

    INSERT INTO public.content_editors (user_id)
    SELECT id FROM public.users WHERE email = 'editor@example.com'
    ON CONFLICT (user_id) DO NOTHING;

El UUID del editor puede consultarse en `public.users` y se pasa explícitamente a los CLIs. No se debe exponer `DATABASE_URL` ni estas herramientas administrativas al frontend o a una API pública.

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
- SHA-256 canónico que ignora espacios, orden de claves y el orden de relaciones sin posición.

## Importación PostgreSQL

La importación resuelve referencias contra el catálogo existente y crea únicamente una versión curricular nueva en estado `draft`. No crea ni modifica vocabulario/frases, no publica contenido y no altera matrículas, tarjetas SRS ni progreso de estudiantes.

Primero se aplican todas las migraciones, incluida `20261118000000_curriculum_content_package_imports.sql`, `20261118010000_curriculum_package_export_visibility.sql`, `20261118020000_curriculum_content_editors.sql`, `20261118030000_curriculum_review_order.sql` y `20261118040000_curriculum_publication_completeness.sql`.

Modo predeterminado (**dry-run**, no persiste):

    DATABASE_URL='postgresql://…' node tools/curriculum/import_content_package.mjs tests/fixtures/curriculum/phase1_3_content_package_v1.json --actor-user-id <EDITOR_UUID>

Para guardar la nueva versión `draft` explícitamente:

    DATABASE_URL='postgresql://…' node tools/curriculum/import_content_package.mjs tests/fixtures/curriculum/phase1_3_content_package_v1.json --actor-user-id <EDITOR_UUID> --apply

El importador:

1. Reejecuta el validador offline y utiliza su SHA-256 canónico.
2. Comprueba que el actor está registrado en `content_editors` mediante RLS.
3. Serializa importaciones por identidad estable del curso.
4. Resuelve cada palabra por `word + category` y cada frase por `word + english_text`; referencias ausentes o ambiguas abortan toda la transacción.
5. Inserta cursos/rutas si no existen, y una versión nueva siempre en estado `draft`.
6. Inserta unidades, lecciones, objetivos, skills, vínculos, prerequisitos y referencias existentes.
7. Registra formato, versión de esquema, presencia de campos opcionales, SHA-256 y metadatos de procedencia.
8. Trata una repetición con el mismo hash como no-op idempotente.
9. Rechaza contenido diferente para la misma versión; se debe incrementar `version_number`, nunca sobrescribirla.

El modo `dry-run` ejecuta las mismas consultas, claves foráneas, triggers y políticas RLS dentro de una transacción que siempre revierte.

## Exportación canónica

Exporta una versión que haya sido creada por el importador:

    DATABASE_URL='postgresql://…' node tools/curriculum/export_content_package.mjs --course english-general --level PRE_A1 --version 1 --actor-user-id <EDITOR_UUID> --output /tmp/english-general-pre-a1-v1.json

Sin `--output`, el JSON se escribe en stdout. La operación es de solo lectura. El exportador:

- Reconstruye el paquete desde cursos, versiones, unidades, lecciones, objetivos, competencias, prerequisitos y referencias relacionales.
- Preserva metadatos de procedencia y la presencia/ausencia original de `content_schema_version`.
- Vuelve a ejecutar el validador offline.
- Compara el hash reconstruido contra el SHA-256 almacenado en el ledger; falla ante modificaciones relacionales posteriores al import.
- Rechaza exportaciones con relaciones que el contrato v1 no puede representar (por ejemplo, objetivos opcionales), en lugar de perder datos silenciosamente. La publicación también bloquea esas relaciones para evitar versiones publicadas que no puedan exportarse fielmente.

Las versiones creadas antes del ledger de importación no tienen procedencia canónica y no se exportan mediante esta herramienta.

## Revisión y publicación editorial

Todas las acciones son **dry-run por defecto**. Los cambios requieren `--apply`.

Enviar una versión draft a revisión:

    DATABASE_URL='postgresql://…' node tools/curriculum/manage_course_version.mjs --action submit --course english-general --level PRE_A1 --version 1 --actor-user-id <EDITOR_UUID> --apply

Aprobar una versión (la aprobación no publica automáticamente):

    DATABASE_URL='postgresql://…' node tools/curriculum/manage_course_version.mjs --action review --course english-general --level PRE_A1 --version 1 --actor-user-id <REVIEWER_UUID> --decision approved --comments "Reviewed and approved" --apply

Solicitar cambios (la versión vuelve a `draft`; los comentarios quedan en el historial append-only):

    DATABASE_URL='postgresql://…' node tools/curriculum/manage_course_version.mjs --action review --course english-general --level PRE_A1 --version 1 --actor-user-id <REVIEWER_UUID> --decision changes_requested --comments "Add a clearer example" --apply

Publicar requiere que la **última** decisión sea `approved` y pertenezca al mismo editor que ejecuta la publicación:

    DATABASE_URL='postgresql://…' node tools/curriculum/manage_course_version.mjs --action publish --course english-general --level PRE_A1 --version 1 --actor-user-id <REVIEWER_UUID> --apply

La base de datos vuelve a comprobar las transiciones, la aprobación y la integridad académica antes de publicar. La migración `20261118040000_curriculum_publication_completeness.sql` bloquea versiones sin unidades/lecciones/objetivos, unidades vacías, lecciones sin un objetivo obligatorio con criterio de éxito, objetivos huérfanos u objetivos sin exactamente una competencia principal. Esta comprobación también se ejecuta cuando una publicación se intenta mediante SQL u otro camino administrativo, no solo desde el CLI.

Desde que una versión entra en `review`, todas sus filas hijas (unidades, lecciones, objetivos, competencias, vínculos, prerequisitos y referencias) quedan congeladas en PostgreSQL. Solo vuelven a ser editables si una decisión editorial devuelve la versión a `draft`. Las versiones `published` y `archived` permanecen inmutables. La comprobación bloquea movimientos de contenido entre versiones y serializa la mutación de filas hijas con las transiciones de estado.

Los registros de revisión son inmutables; una decisión distinta se agrega al historial. El CLI no sustituye una futura pantalla/API administrativa de Fase 1.5.

## Pruebas

Las pruebas unitarias/estructurales:

    python3 -m unittest discover -s tools/curriculum/tests -p 'test_*.py' -v

Las pruebas de integración requieren el PostgreSQL aislado preparado por CI y las migraciones aplicadas:

    DATABASE_URL='postgresql://…' node --test tools/curriculum/tests/*.test.mjs

CI valida las migraciones desde cero y desde el esquema anterior, importación/exportación round-trip, integridad del hash, referencias externas, rollback, dry-run, idempotencia, no sobrescritura, concurrencia, identidad del editor, ciclo editorial, integridad académica obligatoria al publicar y congelación de las filas hijas durante la revisión.

## Límites de esta entrega

- El importador no crea vocabulario ni frases. Deben existir y ser únicos en el catálogo legado.
- Exportar solo es posible para paquetes que tienen ledger de procedencia.
- La versión queda en `draft` hasta que un editor la envíe a revisión y exista una aprobación explícita.
- El registro `content_editors` se provisiona por un administrador de base de datos; esta entrega no añade una interfaz web de administración.
- El contrato no define ejercicios, respuestas ni rúbricas. Su coherencia se cerrará cuando exista el contrato de actividades de Fase 2.
- La revisión lingüística/editorial de traducciones, ejemplos, explicaciones, fonética y audios del catálogo sigue pendiente de curación de contenido; la herramienta registra procedencia y controla el ciclo de publicación, no certifica la calidad lingüística del material.
