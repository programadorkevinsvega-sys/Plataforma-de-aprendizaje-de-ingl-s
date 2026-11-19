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
| Ejemplos ingleses en el catálogo léxico | 2.287 |
| Recursos de reading | 13 |
| Guiones de listening | 13 |

Los nuevos elementos incluyen expresiones funcionales, sentence frames, colocaciones, phrasal verbs, marcadores discursivos, vocabulario técnico y términos de ingeniería de software/operaciones. Las dos rutas se mantienen separadas por contexto y nivel.

## Taxonomía canónica

Las 26 categorías cubren comunicación social, identidad, relaciones, rutinas, tiempo/cantidades, funciones gramaticales, hogar, comida/bebida, comunidad, transporte, educación, trabajo, tecnología digital, desarrollo de software, cloud/DevOps, salud, naturaleza, animales, ropa, acciones, descripciones/emociones, objetos/herramientas, compras/dinero, matemáticas/formas, ocio/cultura y deportes.

Las categorías son conceptos de catálogo, no etiquetas improvisadas a partir del archivo de origen. Los IDs son estables; los nombres y las descripciones se mantienen en español e inglés.

## Frecuencia, utilidad y contexto

- `editorial_priority` expresa decisión pedagógica (core, high utility, contextual, domain core, advanced). No es un rango de corpus.
- `frequency.general_rank` y `frequency.spoken_rank` son null hasta cotejar el lema, la categoría gramatical y el sentido con las listas de frecuencia.
- Se declaran NGSL 1.2 y NGSL-Spoken 1.2 como fuentes permitidas bajo CC BY-SA 4.0, con atribución; los datos de frecuencia deben conservar la procedencia y los cambios. El material de Oxford 3000/5000 se usa solo como referencia metodológica: no se copian sus entradas ni posiciones.
- `usefulness`, `context_tags`, `register`, `tracks` y nivel se almacenan de forma separada para filtrar y construir itinerarios sin confundir frecuencia con utilidad.

## Revisión lingüística y pronunciación

Las guías fonéticas antiguas se trasladan únicamente a `pronunciation.draft_candidates` como candidatas no aprobadas. No se muestran como una pronunciación verificada. Las nuevas expresiones no reciben aproximaciones fonéticas inventadas.

Cada unidad y ejemplo mantiene estados editoriales y fonéticos explícitos. Para pasar a `published` se requiere aprobación editorial; si se proporciona fonética española, se requieren ambas guías lenta/natural aprobadas. La meta de acento de referencia es en-US; las variaciones regionales se registrarán de forma explícita, no se mezclarán en un mismo campo.

La revisión humana de naturalidad de los 2.287 ejemplos y de los candidatos fonéticos pendientes no se declara completada por la mera creación del catálogo. El auditor impide que un ítem sin aprobación se publique.

## Lecturas y escuchas

Hay 13 lecturas y 13 guiones de diálogo/escucha originales, con nivel objetivo, ruta, tema, recuento de palabras, patrón de dificultad, foco de comprensión y vocabulario de apoyo.

Los guiones de listening todavía no incluyen audio real. Se marcan como borrador y el reproductor no debe ofrecerse hasta generar el archivo, validar su correspondencia con el guion y registrar voz/acento/licencia del proveedor.

## Sustituciones de legado

Se retiran los tres archivos `seed_lessons*.json`, el importador SQL destructivo `import_vocab.sh` y el motor heurístico `phonetic_engine.js`. La auditoría se sustituye por `tools/curriculum/audit_lexical_catalog.mjs`. Esta rama no importa ni publica contenido en la VM; el paquete sigue en estado editorial draft.

## Verificación

```bash
node tools/curriculum/audit_lexical_catalog.mjs --strict
node --test tools/curriculum/tests/lexical_catalog_audit.test.mjs
```

## Pendientes para cerrar 1.4

1. Completar revisión humana de ejemplos, traducciones, registros, nivel y naturalidad.
2. Cotejar rangos NGSL y NGSL-Spoken con la versión oficial descargable y guardar trazabilidad por lemma/POS/sentido.
3. Validar guías lentas/naturales de manera individual; no activar conversiones automáticas.
4. Producir y validar los 13 assets de audio de escucha, con pruebas de comprensión asociadas.
5. Conectar el importador transaccional y los consumidores backend al nuevo esquema v2; la base actual continúa usando el esquema anterior hasta aplicar su migración de sustitución.

Esta fuente es de autoría original o material de semilla reorganizado. No representa certificación oficial MCER ni garantiza que la revisión lingüística humana esté completada.
