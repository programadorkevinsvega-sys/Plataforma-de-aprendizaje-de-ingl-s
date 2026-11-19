# Integración de frontend estudiantil — Subfases 1.1 a 1.4

## Alcance

Este documento registra la conexión de los resultados de las subfases 1.1–1.4 con la experiencia del estudiante. La zona editorial de 1.3 sigue siendo administrativa y protegida; no se expone al panel de estudiantes ni se concede capacidad editorial desde el navegador.

## Matriz de integración

| Subfase / requisito | Experiencia del estudiante | API / dato utilizado | Estado |
|---|---|---|---|
| 1.1 Rutas General y Tecnología | Catálogo y detalle de cursos muestran ruta, nivel, unidades, lecciones y objetivos | `GET /api/v1/curriculum/courses`, `GET /api/v1/curriculum/courses/:course_version_id` | Integrado |
| 1.1 Progresión y competencias | Objetivos, criterios de éxito, competencias y prerrequisitos se muestran en el detalle del curso | `CurriculumCourseDetail` versionado | Integrado como estructura curricular; la ejecución evaluable depende de Fase 2 |
| 1.2 Versionado y matrícula | El estudiante ve versiones publicadas, se matricula en una versión exacta y consulta desbloqueo/progreso | `POST /api/v1/curriculum/courses/:id/enroll` y detalle curricular | Integrado |
| 1.2 RLS y aislamiento | Las consultas curriculares y de contenido usan identidad autenticada; no se consultan borradores | BFF + servicio de contenido + PostgreSQL/RLS | Integrado en el contrato existente; validar de nuevo en CI |
| 1.3 Importación, revisión y publicación | No se muestran herramientas editoriales al estudiante. Se mantienen en `/admin/curriculum` con comprobación de `content_editors` en backend | Endpoints `/api/v1/curriculum/editor/*` | Separación intencional por rol |
| 1.4 Taxonomía léxica | Filtro por las 26 categorías canónicas bilingües (etiquetas en español para la interfaz) | `tools/curriculum/lexical-taxonomy.v1.json` reflejada en `LexicalTaxonomy.ts` | Integrado |
| 1.4 Clasificación curricular | Filtros por Inglés General/Tecnología, Pre-A1 y A1–C2, con paginación | `GET /api/v1/content/vocabulary?page=&page_size=&track=&level=&category=` | Integrado |
| 1.4 Metadata útil | Se presentan definición en inglés, tipo léxico, rutas, registro, prioridad, utilidad y etiquetas contextuales | `VocabularyWordResponse` v2 → DTO BFF → entidad frontend | Integrado |
| 1.4 Ejemplos y traducción | La práctica presenta la palabra, traducción y ejemplos publicados | `ListVocabularyWords` | Integrado |
| 1.4 Pronunciación dual | Slow/natural sintetizan el texto inglés original; la guía escrita solo se muestra si la palabra y el ejemplo tienen pronunciación aprobada | TTS configurado + estados editoriales de vocabulario/ejemplo | Integrado con guardas editoriales |
| 1.4 Reading | Biblioteca del estudiante con contenido, nivel, ruta, foco y preguntas/opciones sin clave de respuesta | `GET /api/v1/content/comprehension-resources?skill=reading` | Integración terminada; el catálogo permanece vacío hasta que se publique contenido aprobado |
| 1.4 Listening | Reproductor de audio aprobado y preguntas/opciones sin clave ni transcripción | `GET /api/v1/content/comprehension-resources?skill=listening` | UI/API integradas; no hay audios aprobados disponibles todavía |

## Rutas del panel

- `/courses`: catálogo de cursos/versiones visibles para estudiantes.
- `/courses/[versionId]`: detalle de la versión, unidades, lecciones, objetivos, criterios, competencias, prerrequisitos, matrícula y evidencia de progreso disponible.
- `/learn`: vocabulario paginado, filtros por ruta/nivel/categoría, traducción, definición, contexto y pronunciación.
- `/comprehension`: biblioteca filtrable de Reading y Listening.
- `/admin/curriculum`: administración editorial; no es una pantalla estudiantil.

La navegación principal incluye Práctica y Reading/Listening. El detalle de curso también enlaza a esas áreas de trabajo.

## Correcciones de integración y legado

- La consulta del BFF ya no pide 1.000 vocablos en una sola llamada; respeta el límite gRPC de 50 y usa paginación.
- El filtro de ruta se propaga desde el frontend hasta PostgreSQL y utiliza `tracks`.
- La lectura de metadatos v2 llega al frontend en lugar de descartarse en el contrato protobuf.
- Se eliminaron del BFF las rutas heredadas de “lección del día” sintética y “marcar palabra completada” que devolvía `completed: true` sin persistir. El panel usa el flujo persistente `POST /api/v1/progress/learn`.
- Una guía de pronunciación sin aprobación no se representa como verificada ni tiene controles duales falsos.
- Listening no devuelve la transcripción; el contenido del guion se mantiene fuera de la vista del estudiante.

## Límites que no se deben ocultar

1. Los 790 ítems léxicos y los 2.201 ejemplos siguen pendientes de revisión editorial humana. La UI solo devuelve filas publicadas, no convierte el borrador en contenido visible.
2. Los 13 recursos de Reading siguen pendientes de revisión; los 13 guiones de Listening no tienen todavía audio real aprobado. Por tanto, las páginas pueden mostrar estados vacíos legítimos hasta que exista contenido aprobado.
3. Los ejercicios interactivos de gramática, escritura, speaking y la corrección/registro de respuestas de Reading/Listening requieren el contrato común, los intentos y el motor de actividades de Fase 2. Esta integración no inventa puntuaciones ni finge que una pregunta está evaluada.
4. Los rangos de frecuencia NGSL/NGSL-Spoken siguen sin validar; no se muestran como posiciones ni como prioridad.
5. El progreso curricular actual usa evidencia de vocabulario y revisiones SRS disponibles; la repetición SM-2 no se presenta como una evaluación general de competencia.

## Verificación pendiente

Esta rama debe pasar CI completo en Rust y frontend antes de integrarse. El catálogo editorial no se publica por esta rama ni se modifican los estados pendientes. La verificación de publicación con contenido real requiere además un editor autorizado y un entorno de staging con los datos/importación revisados; no se sustituye por fixtures de CI.
