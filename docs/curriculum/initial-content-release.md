# Carga inicial de Inglés General: Pre-A1 y A1

Esta entrega prepara dos versiones iniciales del curso **English General** y cuatro recursos originales de comprensión (Reading y Listening) para Pre-A1 y A1. Los paquetes de curso enlazan objetivos con entradas y ejemplos exactos del catálogo léxico v2, por ruta y nivel.

## Paquetes de curso

| Versión | Unidades | Lecciones | Objetivos | Referencias léxicas | Ejemplos |
|---|---:|---:|---:|---:|---:|
| Pre-A1 | 3 | 5 | 5 | 18 | 14 |
| A1 | 3 | 5 | 5 | 13 | 13 |

Los dos paquetes usan el mismo curso estable `english-general`, versión 1 para cada nivel CEFR. Los objetivos cubren comunicación básica, presentaciones personales, descripciones, acciones cotidianas, números, rutinas y viajes.

## Recursos de comprensión preparados

Se sustituyen los cuatro recursos iniciales del catálogo para Inglés General:

- Pre-A1 Reading: **A new English class** (34 palabras, 3 preguntas).
- Pre-A1 Listening: **Your first English class** (29 palabras, 3 preguntas).
- A1 Reading: **Mateo's working day** (53 palabras, 3 preguntas).
- A1 Listening: **Checking in at a hotel** (41 palabras, 3 preguntas).

Los guiones son originales. Cada pregunta incluye opciones identificadas, respuesta correcta, evidencia textual y justificación. La clave no se entrega al panel del estudiante. Las preguntas y recursos permanecen pendientes de revisión editorial humana; esta entrega no simula una aprobación.

## Corrección de resolución de referencias

El importador de cursos resuelve las referencias únicamente contra `devfluency.lexical-catalog.v2` y el nivel CEFR de la versión. Esto evita que una fila heredada con la misma palabra/categoría o frase haga que una referencia sea ambigua o apunte al contenido equivocado. La prueba de integración crea duplicados heredados deliberadamente y comprueba que el importador selecciona el registro canónico.

## Importar en PostgreSQL

Requisitos: migraciones de currículo aplicadas, conexión confiable `DATABASE_URL` y un usuario UUID ya registrado en `public.content_editors`.

Primero ejecutar la importación completa del catálogo con los cuatro recursos originales superpuestos:

```bash
node tools/curriculum/import_initial_release_catalog.mjs --actor-user-id <EDITOR_UUID>
node tools/curriculum/import_initial_release_catalog.mjs --actor-user-id <EDITOR_UUID> --apply
```

El primer comando es un dry-run transaccional; el segundo persiste las 790 entradas léxicas, los 2.201 ejemplos y 26 recursos de comprensión como borradores. Nunca publica contenido.

Después importar los paquetes de curso:

```bash
node tools/curriculum/import_content_package.mjs tests/fixtures/curriculum/initial-release-english-general-pre-a1-v1.json --actor-user-id <EDITOR_UUID> --apply
node tools/curriculum/import_content_package.mjs tests/fixtures/curriculum/initial-release-english-general-a1-v1.json --actor-user-id <EDITOR_UUID> --apply
```

Cada curso queda como `draft`. Su transición se hace por nivel y de forma explícita:

```bash
node tools/curriculum/manage_course_version.mjs --action submit --course english-general --level PRE_A1 --version 1 --actor-user-id <EDITOR_UUID> --apply
node tools/curriculum/manage_course_version.mjs --action review --course english-general --level PRE_A1 --version 1 --actor-user-id <EDITOR_UUID> --decision approved --apply
node tools/curriculum/manage_course_version.mjs --action publish --course english-general --level PRE_A1 --version 1 --actor-user-id <EDITOR_UUID> --apply
```

Repetir para `A1`. Revisar el contenido antes de aprobarlo; quien registra la decisión debe ser un editor autorizado.

## Vocabulario, Reading y Listening

La importación léxica mantiene palabras y ejemplos en `draft`. Cada palabra, sus ejemplos y ambas guías de pronunciación requieren revisión por separado; la publicación exige el paso `draft → review → published`, un editor autorizado y guías lenta/natural aprobadas o pronunciación marcada explícitamente como no requerida.

Los recursos Reading y Listening también quedan como `draft`. Cada pregunta requiere aprobación editorial; Listening necesita un MP3 real validado, una URL de asset aprobada y transcript oculto. El exportador produce un catálogo temporal que incluye exactamente los cuatro recursos del paquete; el generador Rust debe recibir ese archivo con `--catalog` y los dos identificadores `--resource-id` para sintetizar solo los guiones nuevos Pre-A1/A1, después de validar la integridad de los 13 listening del catálogo. Produce dos MP3 y un manifiesto con hashes en estado `generated_pending_audio_review`; no modifica PostgreSQL ni publica URLs.

```bash
node tools/curriculum/import_initial_release_catalog.mjs --export-merged-catalog /tmp/devfluency-initial-release-catalog.v2.json
cargo run --package phonetic-audio-service --bin generate-listening-assets -- --catalog /tmp/devfluency-initial-release-catalog.v2.json --resource-id general-pre_a1-listening-02 --resource-id general-a1-listening-04 --dry-run
TTS_SMOKE_ENDPOINT=http://127.0.0.1:50054 cargo run --package phonetic-audio-service --bin generate-listening-assets -- --catalog /tmp/devfluency-initial-release-catalog.v2.json --resource-id general-pre_a1-listening-02 --resource-id general-a1-listening-04 --apply --voice Matthew --output-dir /tmp/devfluency-listening-audio
```

Tras escuchar cada archivo, un editor debe revisar su calidad, proveedor/licencia y guion, almacenar el asset en el origen público configurado y registrar la aprobación antes de publicar el Listening. Este repositorio no contiene las credenciales TTS ni una conexión de almacenamiento que permita completar esos pasos desde CI.

## Estado de esta entrega

Esta rama añade paquetes reproducibles, recursos originales y pruebas. No se ha ejecutado ninguna escritura sobre la base de datos ni el proveedor TTS; no se afirma que haya cursos o contenido ya publicados en producción. La importación y la aprobación editorial siguen siendo operaciones separadas y verificables.
