# Fase 1.2 — Modelo de dominio y persistencia curricular

- **Estado:** propuesta técnica implementada en PR para revisión
- **Fase:** 1.2 — Modelo y migraciones
- **Fecha:** 2026-11-17
- **Base:** ADR-0001, ADR-0002, ADR-0003 y blueprint de Fase 1.1
- **Alcance:** catálogo curricular versionado, ciclo editorial, relaciones académicas, inscripción y aislamiento de datos personales

## 1. Hallazgos del esquema existente

La base actual persiste usuarios y sesiones; vocabulario y frases (incluidas las guías de pronunciación lenta/natural); tarjetas SRS; exámenes históricos agregados; logros, preguntas de entrevista, estadísticas y eventos de recompensa.

No existen tablas para cursos, versiones curriculares, unidades, lecciones académicas, objetivos, competencias relacionadas ni matrículas. La ruta «lección del día» se construye como DTO y no representa una lección persistida. La auditoría tampoco encontró un importador activo para los JSON A0/A1; no deben darse por importados a PostgreSQL.

Dos campos heredados no son dominio académico fiable: users.current_level es un valor de perfil y user_stats.current_level se calcula a partir de XP en Gamification. Ninguno debe convertirse en mastery ni nivel MCER. Se mantienen por compatibilidad hasta una migración de perfil/diagnóstico posterior.

## 2. Límites del dominio

Se conserva la arquitectura actual. No se crea otro microservicio.

| Módulo existente | Responsabilidad en el modelo objetivo | Límite |
|---|---|---|
| Content Vocabulary | Identidad del curso, versiones, unidades, lecciones, objetivos, competencias y referencias al contenido compartido | No califica dominio académico |
| Auth Identity | Identidad y autenticación | No decide progreso ni nivel de idioma |
| SRS Engine | Planificación y registro de repasos | Una tarjeta repasada no equivale a una lección aprobada |
| Gamification Progress | XP, monedas, rachas, logros y leaderboard | XP no es un nivel CEFR |
| BFF | Orquestación y autorización del caso de uso | No sustituye integridad de PostgreSQL |

El material conversacional no se persiste en esta fase. Se mantiene la decisión pendiente de retención de ADR-0006. Tampoco se crea una tabla genérica de assets: audio y guías actuales siguen vinculados a vocabulario/frases hasta aprobar un contrato de almacenamiento y versionado de recursos.

## 3. Modelo lógico

### 3.1. Agregado curricular

El agregado es Course → CourseVersion → Unit → Lesson → LearningObjective, de acuerdo con ADR-0001. Competencias, vocabulario, frases y prerequisitos se relacionan mediante asociaciones explícitas.

| Entidad física | Función | Claves y restricciones principales |
|---|---|---|
| courses | Identidad estable de una ruta | slug único; track general o technology |
| course_versions | Snapshot editorial de un curso y nivel | versión positiva única por curso y nivel; nivel canónico; estado; máximo una versión publicada por curso/nivel |
| course_units | Unidad temática ordenada | código y posición únicos dentro de la versión |
| course_lessons | Lección dentro de una unidad | posición única por unidad; patrón discover/understand/practice/integrate/custom |
| learning_objectives | Resultado observable y criterio de éxito | código único por versión; criterio de éxito obligatorio |
| learning_skills | Catálogo controlado de competencias | vocabulary, grammar, listening, reading, writing, speaking, interaction, mediation y phonology |
| learning_objective_skills | Relación N:M entre objetivo y competencia | permite evidencias separadas por competencia |
| lesson_learning_objectives | Objetivos que una lección enseña | impide relacionar lecciones y objetivos de distintas versiones |
| lesson_prerequisites | Grafo de desbloqueo entre lecciones | relaciones dentro de la misma versión; completed o mastery threshold |
| learning_objective_vocabulary | Vocabulario actual asociado a objetivos | receptive/productive/both; no duplica palabras |
| learning_objective_sentences | Frases actuales asociadas a objetivos | listening/reading/speaking/writing/example |
| course_version_reviews | Historial de decisión editorial | revisor, decisión, comentarios y fecha |
| course_enrollments | Matrícula privada fijada a una versión | una matrícula por usuario/versión |

### 3.2. Nivel y rutas

- PRE_A1 es el código canónico de almacenamiento. A0 seguirá siendo un alias visual/interno si el producto lo necesita; no se almacena como nivel MCER adicional.
- Se admiten PRE_A1, A1, A2, B1, B2, C1 y C2.
- courses.track_code diferencia Inglés General y Tecnología.
- course_versions.cefr_level alinea cada edición de curso con un nivel. La ruta tecnológica tiene su propio nivel y no eleva automáticamente el nivel general.
- No hay equivalencia entre ruta, nivel MCER y XP.

### 3.3. Competencias y evidencias

Las competencias están normalizadas para evitar cadenas libres inconsistentes. Listening, reading, writing, speaking, interaction, mediation, vocabulario, gramática y fonología pueden asociarse de manera independiente a un objetivo.

La relación con vocabulario y frases es referencial: se conserva el catálogo existente y no se duplica material. La modalidad queda explícita. Una actividad y sus ítems aún no se crean físicamente: su contrato de ejecución, respuestas, pistas, retroalimentación, scoring y versionado pertenecen a Fase 2. Fase 1.2 deja los objetivos y asociaciones académicas que ese motor consumirá.

## 4. Ciclo editorial y versionado

Estados:

- **draft:** edición permitida.
- **review:** contenido congelado durante la revisión; para corregirlo debe volver a draft.
- **published:** visible para estudiantes y estrictamente inmutable.
- **archived:** no admite nuevas matrículas ni cambios; permanece disponible para el historial de quienes ya se inscribieron.

La base controla transiciones, exige la última revisión aprobada del revisor registrado para publicar, congela metadatos/contenido durante review y evita alterar una versión publicada. La edición requiere crear version_number + 1, revisarla y publicarla. Un índice parcial impide dos versiones publicadas simultáneas del mismo curso y nivel. Esto permite publicar General A1, A2, B1, etc. en paralelo, igual que los niveles de Tecnología.

El estado está en course_versions, no repetido en unidades y lecciones. Así la publicación aplica al agregado completo. course_version_reviews conserva un historial append-only; solo se permite anonimizar reviewer_id al eliminar un usuario.

### Matrículas fijadas a versión

Una matrícula referencia course_version_id, no solo course_id. La base rechaza una nueva matrícula si la versión no está publicada. Al publicar una edición nueva, las matrículas anteriores no se actualizan silenciosamente. La versión anterior se archiva y sus estudiantes conservan la referencia al snapshot. Cualquier traslado de matrícula será una operación explícita posterior, con conservación del historial.

## 5. Integridad e invariantes

1. Cada unidad, lección y objetivo pertenece a una única versión.
2. Una lección y sus objetivos asociados deben compartir course_version_id.
3. Los prerequisitos no pueden cruzar versiones.
4. Las referencias léxicas apuntan a vocabulary_words y context_sentences existentes; no se borran recursos referenciados.
5. Las posiciones son positivas y únicas dentro de su ámbito.
6. El criterio de éxito del objetivo es obligatorio.
7. Una nueva matrícula necesita una versión publicada.
8. Los intentos futuros deben identificar la versión exacta de actividad/contenido.
9. El grafo de prerequisitos debe ser acíclico. Las claves foráneas evitan referencias inexistentes y auto-referencias; el validador/importador de Fase 1.3 debe detectar ciclos indirectos antes de importar o publicar.
10. El contenido publicado y archivado no se modifica ni elimina.
11. XP, monedas, rachas y logros no intervienen en mastery académico.

## 6. Seguridad y RLS

### Datos personales

course_enrollments contiene estado privado. Tiene RLS habilitado y forzado, con políticas USING y WITH CHECK por app.current_user_id. Sin contexto de usuario no devuelve matrículas y una escritura con otro user_id es rechazada.

El servicio debe establecer identidad con set_config(..., true) dentro de la misma transacción que consulta o modifica la matrícula. No debe dejar un contexto de sesión persistente que pueda contaminar otra conexión del pool.

### Catálogo compartido

El currículo no es propiedad de un estudiante. Las políticas permiten lectura de versiones publicadas y sus descendientes. Una versión archivada y sus lecciones siguen visibles únicamente para estudiantes que ya tengan una matrícula fijada a esa versión. Los borradores/revisiones solo son visibles cuando la operación editorial autenticada establece app.content_editor=true.

Ese parámetro no autentica por sí solo a un editor. Antes de exponer operaciones editoriales, el backend debe comprobar un permiso real, establecer el GUC localmente y hacerlo dentro de una transacción. Nunca se debe confiar en un valor enviado por el navegador. El test RLS usa un rol PostgreSQL no propietario y sin BYPASSRLS, no el superusuario del runner.

Las tablas nuevas de contenido se crean con RLS forzado. El despliegue debe usar un rol runtime sin BYPASSRLS; un superusuario puede eludir RLS y no sirve como evidencia de aislamiento.

## 7. Índices y consultas objetivo

Los índices iniciales se derivan de consultas funcionales previstas y restricciones de integridad, no de medición de carga:

| Consulta prevista | Índice/constraint |
|---|---|
| Obtener versión publicada de un curso | índice único parcial por course_id donde status=published |
| Descubrir cursos publicados por nivel | cefr_level + course_id en versiones publicadas |
| Ordenar unidades de una versión | unique course_version_id + position |
| Listar lecciones de una unidad | unique unit_id + position e índice version/unit/position |
| Listar objetivos por versión | course_version_id + position |
| Resolver prerequisitos inversos | prerequisite_lesson_id |
| Encontrar objetivos por palabra/frase | índices sobre las FK de vocabulario y frases |
| Consultar matrículas recientes | user_id + status + last_accessed_at descendente |

No se añaden índices especulativos de búsqueda textual, etiquetas o analítica. Índices no únicos se validarán con EXPLAIN (ANALYZE, BUFFERS) y datos representativos en staging. Esa medición sigue pendiente y no se marca como completada en esta PR.

## 8. Compatibilidad y estrategia de migración

Se añade una migración SQL nueva y aislada. No modifica columnas, constraints, contratos ni consultas de las tablas existentes. Las tablas anteriores siguen siendo válidas mientras se migran endpoints en fases posteriores.

El CI valida dos recorridos independientes:

1. Base vacía: aplicar todas las migraciones cronológicamente y ejecutar aserciones del nuevo modelo.
2. Base equivalente al esquema actualmente versionado: aplicar primero todas las migraciones anteriores y después solo la nueva, y ejecutar las mismas aserciones.

Esto reconstruye el baseline conocido por las migraciones. No sustituye una prueba contra un backup real de producción ni autoriza probar o desplegar migraciones sobre producción desde esta PR.

## 9. Qué se implementa ahora y qué queda para después

| Elemento | Decisión |
|---|---|
| Courses, versions, units, lessons, objectives, skills, prerequisites | Crear esquema en Fase 1.2 |
| Estado editorial y revisión | Crear estados, transiciones e inmutabilidad en Fase 1.2 |
| Matrícula fijada a una versión | Crear esquema y RLS en Fase 1.2 |
| Vocabulario y frases | Reutilizar tablas actuales con tablas de asociación |
| Actividades, exercise items, sesiones e intentos | Contrato y motor en Fase 2 |
| Evaluación, evidencias y mastery por objetivo/habilidad | Fase 3; no reutilizar ai_exam_sessions como mastery |
| SRS ligado a objetivos/versiones | Evolución en Fase 4, conservando tarjetas existentes |
| Planes adaptativos y recomendación | Depende de evidencia real de Fase 3 |
| Conversaciones y turnos persistentes | No crear hasta cerrar retención/consentimiento de ADR-0006 |
| Importador, validador y CLI editorial | Fase 1.3 |
| Curación del catálogo A0/A1 | Fase 1.4 |
| API de catálogo y administración | Fase 1.5 |

## 10. Criterios de aceptación de esta entrega

- [x] El diseño identifica relaciones, claves, referencias e invariantes.
- [x] El esquema es aditivo y no altera las tablas existentes.
- [x] La publicación requiere revisión y las versiones publicadas son inmutables.
- [x] La matrícula queda fijada a una versión y protegida por RLS.
- [x] Los borradores no se muestran en consultas de estudiante.
- [x] El CI prueba instalación desde cero y actualización desde la secuencia de migraciones existente.
- [ ] Medir planes/índices con carga y consultas representativas en staging.
- [ ] Probar el esquema contra una copia restaurada de la base desplegada antes de usarlo en producción.

Los dos puntos finales requieren staging/VM y evidencia real; no se simulan con el CI de GitHub.
