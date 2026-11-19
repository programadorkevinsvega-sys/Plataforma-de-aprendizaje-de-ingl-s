# Subfase 1.4 — Catálogo léxico y recursos graduados v2

## Decisión de modelo

La colección anterior de tres JSON por nivel queda sustituida por una única fuente de verdad:

- `crates/content-vocabulary-service/data/lexical_catalog.v2.json`
- `tools/curriculum/lexical-taxonomy.v1.json`

No se conserva el alias A0 ni los nombres de categoría antiguos. Los niveles persistidos son `PRE_A1`, `A1`, `A2`, `B1`, `B2`, `C1` y `C2`. Las categorías utilizan identificadores controlados compartidos entre rutas.

## Inventario de la nueva fuente

| Elemento | Cantidad |
|---|---:|
| Categorías canónicas | 26 |
| Unidades léxicas | 790 |
| Vocablos/sentidos trasladados y deduplicados desde la primera colección | 704 |
| Nuevas expresiones y unidades contextualizadas | 86 |
| Ejemplos ingleses en el catálogo léxico | 2.201 |
| Recursos de reading | 13 |
| Guiones de listening | 13 |

Los nuevos elementos incluyen expresiones funcionales, sentence frames, colocaciones, phrasal verbs, marcadores discursivos, vocabulario técnico y términos de ingeniería de software/operaciones. Las dos rutas se mantienen separadas por contexto y nivel.

## Taxonomía canónica

Las 26 categorías cubren comunicación social, identidad, relaciones, rutinas, tiempo/cantidades, funciones gramaticales, hogar, comida/bebida, comunidad, transporte, educación, trabajo, tecnología digital, desarrollo de software, cloud/DevOps, salud, naturaleza, animales, ropa, acciones, descripciones/emociones, objetos/herramientas, compras/dinero, matemáticas/formas, ocio/cultura y deportes.

Las categorías son conceptos de catálogo, no etiquetas improvisadas a partir del archivo de origen. Los IDs son estables; los nombres y las descripciones se mantienen en español e inglés.

## Frecuencia, utilidad y contexto

- `editorial_priority` expresa decisión pedagógica (core, high utility, contextual, domain core, advanced). No es un rango de corpus.
- `frequency.general_rank` y `frequency.spoken_rank` son null hasta cotejar la forma de lema con la entrada exacta de las listas. NGSL/NGSL-Spoken usan lemas modificados que agrupan categorías gramaticales; el rango resultante es de lema, no de sentido/POS independiente. No se debe atribuir el mismo rango a una acepción distinta como si fuera una frecuencia por sentido.
- Se declaran NGSL 1.2 y NGSL-Spoken 1.2 como fuentes permitidas bajo CC BY-SA 4.0, con atribución; los datos de frecuencia deben conservar archivo fuente, URL, metodología y SHA-256. El material de Oxford 3000/5000 se usa solo como referencia metodológica: no se copian sus entradas ni posiciones.
- `usefulness`, `context_tags`, `register`, `tracks` y nivel se almacenan de forma separada para filtrar y construir itinerarios sin confundir frecuencia con utilidad.

### Cotejo reproducible de frecuencia

Los recursos oficiales descargables son [NGSL 1.2](https://www.newgeneralservicelist.com/new-general-service-list) y [NGSL-Spoken 1.2](https://www.newgeneralservicelist.com/ngsl-spoken). NGSL cubre 2.809 lemas de inglés general; NGSL-Spoken contiene 721 entradas para habla no guionizada. Ambas listas declaran CC BY-SA 4.0 y requieren atribución.

Descarga directa desde los enlaces oficiales (el formato CSV lo entrega la página oficial):
```bash
curl -fL https://www.newgeneralservicelist.com/s/NGSL_12_stats.csv \
  -o /tmp/NGSL_12_stats.csv
curl -fL https://www.newgeneralservicelist.com/s/NGSL-Spoken_12_stats.csv \
  -o /tmp/NGSL-Spoken_12_stats.csv
```

El script `tools/curriculum/match_lexical_frequency.mjs` hace coincidencia exacta de lema modificado; no usa fuzzy matching, stemming ni traducción para adivinar equivalencias. Produce un informe con coincidencias, elementos sin correspondencia, expresiones omitidas, atribución, URL y SHA-256 del archivo. Solo aplica rangos cuando recibe los dos CSV:
```bash
node tools/curriculum/match_lexical_frequency.mjs \
  --ngsl /ruta/NGSL_12_stats.csv \
  --ngsl-spoken /ruta/NGSL-Spoken_12_stats.csv

# Aplicar después de revisar el informe generado
node tools/curriculum/match_lexical_frequency.mjs \
  --ngsl /ruta/NGSL_12_stats.csv \
  --ngsl-spoken /ruta/NGSL-Spoken_12_stats.csv \
  --apply
```

El cruce usa las columnas `Lemma`/`Word`/`Headword` y `SFI Rank`/`Rank`. Cada rango aplicado guarda la metodología `exact_modified_lemma`, atribución, licencia, URL y hash del CSV. Las expresiones de varias palabras no se comparan con listas unigramas y quedan como `not_applicable_multiword`. Una coincidencia de lema no demuestra frecuencia de un sentido específico: las listas agrupan usos gramaticales dentro de la entrada del lema.

El estado de ejecución sigue pendiente porque los CSV oficiales no están incorporados en esta rama y no se ha ejecutado el cruce con sus datos completos. No se han escrito rangos numéricos inventados.

## Revisión lingüística y pronunciación

Las guías fonéticas antiguas se trasladan únicamente a `pronunciation.draft_candidates` como candidatas no aprobadas. No se muestran como una pronunciación verificada. Las nuevas expresiones no reciben aproximaciones fonéticas inventadas.

Cada unidad y ejemplo mantiene estados editoriales y fonéticos explícitos. Para pasar a `published` se requiere aprobación editorial; si se proporciona fonética española, se requieren ambas guías lenta/natural aprobadas. La meta de acento de referencia es en-US; las variaciones regionales se registrarán de forma explícita, no se mezclarán en un mismo campo.

La revisión humana de naturalidad de los 2.201 ejemplos y de los candidatos fonéticos pendientes no se declara completada por la mera creación del catálogo. El auditor impide que un ítem sin aprobación se publique.

## Generación reproducible de audio listening

El servicio TTS limita cada síntesis de la aplicación a 1.000 caracteres. Los 13 guiones actuales miden entre 181 y 621 caracteres. El límite se aplica tanto en el BFF como en `phonetic-audio-service`; está por debajo del máximo documentado de Amazon Polly para `SynthesizeSpeech` (6.000 caracteres totales y 3.000 facturables). La documentación oficial de [Amazon Polly](https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html) y [Cloudflare Aura-2 EN](https://developers.cloudflare.com/workers-ai/models/aura-2-en/) describe los límites/entradas de los proveedores.

Se añade el binario `generate-listening-assets`. Por defecto solo muestra inventario y tamaños, sin invocar proveedores. La generación real exige `--apply` y un `phonetic-audio-service` funcionando con el proveedor TTS configurado:

```bash
# Desde la raíz del repositorio: no hace llamadas de audio
cargo run --package phonetic-audio-service --bin generate-listening-assets -- --dry-run

# Ejecuta 13 síntesis secuenciales y escribe MP3 + manifiesto fuera de la web pública
TTS_SMOKE_ENDPOINT=http://127.0.0.1:50054 \
cargo run --package phonetic-audio-service --bin generate-listening-assets -- \
  --apply \
  --voice Matthew \
  --output-dir /tmp/devfluency-listening-audio
```

El manifiesto registra proveedor/modelo/voz, hash SHA-256 del audio y del guion, bytes, referencia de acento en-US y estados `generated_pending_audio_review` / `pending_human_listening_review`. El comando no modifica el catálogo, la base de datos ni publica rutas; además rechaza sobrescribir un directorio existente o un audio ya aprobado. Los MP3 deben escucharse y validarse antes de asociar su URL y aprobación editorial al recurso.

## Lecturas y escuchas

Hay 13 lecturas y 13 guiones de diálogo/escucha originales, con nivel objetivo, ruta, tema, recuento de palabras, patrón de dificultad, foco de comprensión y vocabulario de apoyo.

Los guiones de listening todavía no incluyen audio real. Se marcan como borrador y el reproductor no debe ofrecerse hasta generar el archivo, validar su correspondencia con el guion y registrar voz/acento/licencia del proveedor.

## Sustituciones de legado

Se retiran los tres archivos `seed_lessons*.json`, el importador SQL destructivo `import_vocab.sh` y el motor heurístico `phonetic_engine.js`. La auditoría se sustituye por `tools/curriculum/audit_lexical_catalog.mjs`. Esta rama no despliega ni publica contenido en la VM. Tras integrar la migración, el importador puede cargar el catálogo en PostgreSQL como borrador; solo una revisión editorial explícita permite publicarlo.

## Cobertura real frente al presupuesto curricular

El blueprint de Fase 1.1 define rangos acumulados internos (no equivalentes a requisitos oficiales del MCER). El recuento de la ruta general en v2 es:

| Nivel | Unidades general en este nivel | Acumulado general | Mínimo interno acumulado |
|---|---:|---:|---:|
| PRE_A1 | 237 | 237 | 300 |
| A1 | 462 | 699 | 700 |
| A2 | 7 | 706 | 1.300 |
| B1 | 7 | 713 | 2.200 |
| B2 | 7 | 720 | 3.500 |
| C1 | 6 | 726 | 5.200 |
| C2 | 6 | 732 | 7.500 |

La ruta tecnológica aporta 83 asignaciones adicionales (41 A1, 7 A2, 7 B1, 9 B2, 7 C1 y 6 C2), con 19 unidades compartidas entre rutas. El catálogo total contiene 790 unidades únicas. Por tanto, la expansión actual es una base unificada y no alcanza todavía la cobertura léxica planificada, sobre todo desde A2.

## Estado editorial verificable del catálogo

- Unidades con revisión editorial pendiente: 790/790.
- Ejemplos con pronunciación pendiente: 2.115; otros 86 no tienen candidata fonética porque son expresiones nuevas.
- Rangos de frecuencia general y hablada validados: 0. Hay 709 candidatos de una sola palabra que requieren cruce exacto; 81 expresiones multi-palabra quedan explícitamente fuera de las listas unigramas. Los 709 candidatos siguen con los rangos en null hasta disponer de los CSV oficiales.
- Recursos de listening con audio real aprobado: 0/13.
- Recursos de reading pendientes de revisión editorial/nivel: 13/13.
- Ningún elemento ni recurso se publica automáticamente.

El auditor ahora informa ejemplos ingleses compartidos entre unidades y significados españoles repetidos como advertencias editoriales. No los elimina automáticamente: pueden representar polisemia, sentidos, contextos o reutilización pedagógica legítima y requieren decisión editorial.

## Preguntas de comprensión

Cada uno de los 26 recursos incorpora dos preguntas originales de opción múltiple (52 en total), con tres opciones, clave de respuesta, justificación y evidencia del texto/guion. Las preguntas, distractores y claves siguen en `pending_human_review`; no equivalen a una rúbrica validada ni se publican automáticamente.

La migración v2 persiste las preguntas como JSONB. Antes de publicar un recurso, PostgreSQL exige al menos dos preguntas aprobadas, cada una con una clave que corresponda a una opción existente. El RPC de estudiante devuelve el enunciado y las opciones, pero elimina la clave, la justificación, la evidencia y los estados editoriales. Para listening, el RPC devuelve `content` vacío y la migración/auditor bloquean `transcript_available=true`; por tanto no revela el guion al estudiante. El unlock posterior a una respuesta aún no existe y pertenece al motor de actividades de Fase 2. El guion completo permanece en el paquete editorial para generar y validar el audio.

## Persistencia e integración v2

La migración `20261119000000_lexical_catalog_v2.sql` añade metadatos de procedencia, frecuencia, tipo léxico, rutas, registro, prioridad y estado editorial sobre las tablas léxicas existentes; añade una tabla para recursos de comprensión y un ledger de importaciones. Los registros preexistentes se conservan como `legacy_pending_review`, no como contenido aprobado.

El servicio gRPC consulta únicamente elementos y ejemplos con `publication_status = 'published'`. La publicación exige revisión editorial aprobada y pronunciación aprobada o marcada explícitamente como no requerida. Un listening requiere además URL de audio real y estado de audio aprobado. Se añade `ListComprehensionResources` al contrato gRPC para consultar lecturas y escuchas publicadas mediante filtros de ruta, nivel y competencia, con paginación; la ruta requiere usuario autenticado y nunca devuelve recursos en borrador.

Importación idempotente y transaccional:

```bash
# Previsualizar: siempre rollback; no necesita actor
DATABASE_URL='postgresql://…' node tools/curriculum/import_lexical_catalog.mjs

# Persistir en draft: exige UUID provisionado en content_editors
DATABASE_URL='postgresql://…' node tools/curriculum/import_lexical_catalog.mjs --apply --actor-user-id <EDITOR_UUID>
```

El importador registra el hash SHA-256, conteos, metadatos y editor; rechaza cambios sobre filas publicadas. No publica unidades, ejemplos ni recursos. Los audios se guardan como metadatos pendientes y no se generan falsos assets.

Pruebas cubiertas en CI:
- Migración v2 desde instalación vacía y desde esquema anterior.
- Auditoría estricta, taxonomía compartida y reportes de duplicados candidatos.
- Dry-run sin escrituras, importación transaccional, conteos, ledger, autorización del editor e idempotencia.
- Servicio de vocabulario que no devuelve filas heredadas ni contenido v2 en borrador.

## Verificación

```bash
node tools/curriculum/audit_lexical_catalog.mjs --strict
node --test tools/curriculum/tests/lexical_catalog_audit.test.mjs
```

## Pendientes reales para cerrar 1.4

1. Revisar editorialmente los 790 ítems y sus 2.201 ejemplos: traducciones, naturalidad, registro, categoría, nivel y adecuación contextual.
2. Ampliar la ruta general, especialmente A2–C2, hasta una cobertura aprobada contra el presupuesto curricular; ampliar y revisar por separado la ruta tecnológica.
3. Ejecutar y revisar el cruce exacto de los 709 candidatos unigrama con NGSL 1.2 y NGSL-Spoken 1.2 mediante el script reproducible. Conservar atribución, CC BY-SA 4.0, URL, hash y metodología; tratar el rango como medida del lema modificado (no de una acepción/POS aislada). No inferir rangos mediante fuzzy matching.
4. Validar individualmente las guías lenta/natural existentes y crear las que falten cuando aporten valor pedagógico. La aprobación debe corresponder a pronunciación en-US y tener revisión fonética competente.
5. Generar 13 audios reales de listening con el proveedor TTS configurado, comprobar que cada archivo coincide con el guion, registrar voz/acento/licencia y añadir pruebas de comprensión.
6. Ejecutar la migración v2 y el importador con un editor autorizado en staging; validar el ciclo de revisión/publicación y los resultados del servicio gRPC. No publicar el catálogo completo mientras existan estados pendientes.

Esta fuente es de autoría original o material de semilla reorganizado. No representa certificación oficial MCER ni garantiza que la revisión lingüística humana esté completada.
