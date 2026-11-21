# Roadmap maestro: convertir DevFluency en una plataforma profesional de aprendizaje de inglés

> Estado: especificación funcional y técnica para implementación
> Repositorio: Plataforma-de-aprendizaje-de-ingl-s
> Arquitectura actual: frontend Next.js, BFF Axum, microservicios Rust/gRPC, PostgreSQL, Redis y componentes de mensajería
> Estrategia: implementación incremental por fases, sin sustituir lo que ya funciona y sin aumentar microservicios innecesariamente.

---

## 1. Objetivo del proyecto

Evolucionar la aplicación actual hacia una plataforma de aprendizaje de inglés completa, confiable, medible y escalable, inspirada en las buenas prácticas de productos como Duolingo, pero con identidad propia y una ventaja clara: combinar inglés general con inglés profesional y tecnológico.

El resultado debe permitir que una persona:

1. Empiece desde nivel inicial y siga un camino formativo estructurado.
2. Aprenda vocabulario, gramática y expresiones dentro de situaciones reales.
3. Practique lectura, escritura, comprensión auditiva y conversación.
4. Reciba explicaciones y correcciones útiles, adecuadas a su nivel.
5. Repase lo aprendido en el momento oportuno.
6. Tenga un plan de estudio que se adapte a sus resultados y disponibilidad.
7. Vea su avance real por competencia y por objetivos, no solamente por puntos.
8. Mantenga la motivación mediante metas, rachas, misiones y recompensas equilibradas.
9. Pueda usar un tutor conversacional de IA cuyo proveedor se seleccione mediante configuración de entorno.
10. Disfrute de una experiencia web rápida, accesible, segura y consistente en escritorio y móvil.

La implementación debe completarse en su totalidad. No se debe declarar una fase terminada por haber creado sus pantallas o endpoints: debe cumplir todos sus criterios de aceptación, pruebas automatizadas, documentación y condiciones de operación.

## 2. Alcance funcional

### 2.1. Ruta de inglés general

Construir una ruta académica progresiva que cubra:

- Pre-A1 / A0: fundamentos, expresiones frecuentes y comunicación inicial.
- A1: situaciones básicas, presentaciones, preguntas y conversaciones sencillas.
- A2: actividades cotidianas, descripciones, experiencias y comunicación funcional.
- B1: conversaciones independientes, narración, opiniones y situaciones habituales.
- B2: comunicación fluida, argumentación, comprensión de contenidos más complejos y contexto profesional.
- C1: comunicación avanzada, precisión, matices y contenidos especializados.
- C2: extensión avanzada del currículo, con contenidos y criterios propios de dominio experto.

La ruta debe utilizar descriptores y objetivos compatibles con el MCER/CEFR. La aplicación no debe presentarse como certificadora oficial del CEFR si no existe un proceso externo de acreditación que lo respalde.

### 2.2. Ruta de inglés profesional y tecnológico

Conservar y ampliar la orientación actual a desarrolladores y profesionales de tecnología mediante una ruta especializada que pueda cursarse en paralelo con inglés general.

Áreas iniciales:

- Presentaciones profesionales y experiencia laboral.
- Reuniones, conversaciones de equipo y comunicación asíncrona.
- Entrevistas técnicas y conductuales.
- Desarrollo de software y revisión de código.
- Arquitectura, bases de datos, redes y sistemas distribuidos.
- Cloud, DevOps, CI/CD, observabilidad y seguridad.
- Documentación técnica, incidencias y comunicación con clientes.
- Presentaciones, negociación y explicación de decisiones técnicas.

El contenido especializado debe tener nivel recomendado, requisitos previos, objetivos lingüísticos y contexto de uso. No debe reemplazar las bases generales del idioma.

### 2.3. Tipos de usuario

- Estudiante: consume cursos, realiza ejercicios, conversa con el tutor y consulta su progreso.
- Administrador de contenido: crea, revisa, versiona y publica contenidos.
- Administrador de plataforma: gestiona usuarios, configuración, métricas operativas y catálogos.
- Futuro instructor/revisor: puede revisar contenido o informes académicos si se incorpora un flujo de revisión humana.

Los permisos deben validarse en backend; ocultar botones en el frontend no constituye autorización.

### 2.4. Sistema Dual de Pronunciación para Hispanohablantes

El Sistema Dual de Pronunciación es una herramienta pedagógica central de DevFluency. Su propósito es ayudar a los estudiantes hispanohablantes a relacionar la forma escrita del inglés con sus sonidos, adquirir familiaridad con el ritmo del idioma y practicar la pronunciación con mayor facilidad y confianza. No es un mecanismo de calificación.

Para cada palabra, expresión o frase que lo requiera, la experiencia debe conservar el texto original en inglés y ofrecer dos formas complementarias de escucha:

1. **Pronunciación lenta:** una guía legible aproximada para hispanohablantes y un audio lento, claro y articulado que facilite reconocer los sonidos y practicar partes de la expresión.
2. **Pronunciación natural:** una guía legible aproximada para hispanohablantes y un audio a velocidad conversacional que permita familiarizarse con el ritmo, el acento, el énfasis y la unión natural de sonidos.
3. **Práctica repetida:** el estudiante puede escuchar la versión lenta, repetir en voz alta, escuchar la versión natural y volver a repetir dentro del contexto de la palabra o frase.

Reglas pedagógicas y de calidad:

- La guía escrita es una aproximación didáctica para hispanohablantes; no debe presentarse como IPA ni como representación fonética exacta.
- La aproximación debe ayudar a identificar sonidos sin enseñar equivalencias incorrectas. Debe explicar sonidos que no existen en español cuando sea necesario, por ejemplo el sonido /ð/ de *mother*, que no es idéntico a la «d» española.
- Las guías lenta y natural pueden coincidir cuando una diferencia ortográfica no aporte valor; no se deben inventar variantes solo para que los campos sean distintos.
- El audio lento debe ser inteligible y conservar la identidad de los sonidos. No debe lograrse mediante una alteración que distorsione la voz, el tono o los fonemas.
- El audio natural debe conservar pronunciación, acentuación, ritmo y enlace propios del acento inglés seleccionado para el contenido. El acento de referencia debe ser explícito cuando sea relevante.
- La guía, el audio y el texto original deben corresponder exactamente a la misma palabra o expresión y a la misma versión del contenido.
- La función debe estar disponible de forma contextual en vocabulario, frases, lecciones, ejercicios y otros lugares donde el estudiante necesite aprender o practicar una expresión.
- La reproducción debe poder repetirse fácilmente y funcionar con teclado, lectores de pantalla y controles accesibles.
- El sistema debe reutilizar el proveedor TTS configurado y sus capacidades sin acoplarlo al proveedor conversacional de IA.
- El sistema enseña y facilita la práctica; no debe afirmar que el estudiante pronuncia correctamente sin analizar una grabación real mediante un proceso de evaluación separado.

### 2.5. No objetivos

- No reconstruir toda la arquitectura ni crear un microservicio por cada funcionalidad.
- No sustituir PostgreSQL, Redis, NATS/JetStream ni la infraestructura actual sin una decisión técnica documentada.
- No convertir XP, monedas o rachas en una medida del nivel académico.
- No depender exclusivamente de un modelo generativo para calificar ejercicios que tienen una respuesta determinista.
- No guardar secretos, prompts internos ni credenciales en el repositorio.
- No introducir cambios incompatibles en los endpoints actuales sin migración, compatibilidad y plan de retirada.

---

## 3. Principios de diseño

1. **Aprendizaje antes que gamificación:** las recompensas deben reforzar hábitos y dominio, no reemplazar el aprendizaje.
2. **Progresión demostrable:** cada avance académico debe estar sustentado por intentos y evidencias.
3. **Práctica activa:** el estudiante debe recordar, seleccionar, construir, comprender y producir lenguaje.
4. **Contexto real:** las palabras y estructuras deben practicarse dentro de frases, conversaciones y escenarios.
5. **Adaptación explicable:** el sistema debe poder explicar por qué recomienda una actividad.
6. **IA intercambiable:** el dominio de conversación no debe depender de un proveedor concreto.
7. **Determinismo donde sea posible:** respuestas cerradas se califican mediante reglas; la IA se reserva para tareas abiertas, tutoría y generación controlada.
8. **Privacidad por defecto:** se minimiza el historial, los datos enviados a proveedores externos y la retención.
9. **Arquitectura evolutiva:** priorizar módulos y límites de dominio claros antes de añadir servicios desplegables.
10. **Calidad verificable:** ninguna fase queda completa sin pruebas, telemetría, documentación y aceptación.
11. **Compatibilidad hacia atrás:** migraciones aditivas, contratos versionados y despliegues seguros.
12. **Sin funcionalidad ficticia:** no utilizar resultados, métricas o ejercicios de demostración como si fueran datos reales.

---

## 4. Estado inicial y estrategia de evolución

El repositorio ya cuenta con una base que debe reutilizarse y verificarse antes de modificarla:

- Frontend Next.js con pantallas de dashboard, aprendizaje, entrevistas, resultados, ejercicios de refuerzo, SRS, logros, clasificación, perfil y configuración.
- BFF HTTP con Axum y clientes gRPC.
- Microservicios Rust para autenticación/identidad, vocabulario/contenido, evaluación IA, audio, SRS y progreso/gamificación.
- PostgreSQL con migraciones y controles de aislamiento por usuario.
- Redis y componentes de mensajería incluidos en la arquitectura.
- Contenido semilla A0 y A1, además de preguntas de entrevista y logros.
- Motor SRS basado en SM-2.
- Síntesis de voz con selección de proveedor independiente.
- Transcripción de audio en los flujos existentes.
- CI/CD con compilación de binarios y despliegue de servicios.

Este inventario no implica que todas las capacidades estén terminadas o tengan cobertura suficiente. Cada fase debe revisar el comportamiento real, reutilizar lo correcto y sustituir implementaciones incompletas.

### 4.1. Regla para añadir microservicios

La primera opción será ampliar los servicios existentes mediante módulos internos bien separados. Solo se creará un nuevo microservicio cuando exista al menos una razón demostrable:

- Escalado independiente requerido por carga o coste.
- Ciclo de despliegue claramente diferente.
- Aislamiento de seguridad o datos.
- Necesidad operacional de disponibilidad independiente.
- Propiedad de dominio que no pueda mantenerse razonablemente dentro del servicio actual.

Toda nueva separación requiere ADR (Architecture Decision Record), contratos gRPC/HTTP, pruebas de contrato, métricas, política de reintentos, timeouts, despliegue y rollback.

---

## 5. Modelo de dominio objetivo

El modelo de datos deberá evolucionar de forma incremental. Los nombres siguientes son conceptos de dominio, no una orden para crear una tabla por cada nombre sin analizar normalización e índices.

### 5.1. Estructura académica

- Course: ruta formativa, por ejemplo Inglés General o English for Software Engineering.
- CourseVersion: versión inmutable del contenido publicado.
- CEFRLevel: nivel del curso y sus objetivos.
- Unit: bloque temático dentro de un curso.
- Lesson: unidad didáctica con objetivos y actividades.
- LearningObjective: resultado observable que debe conseguir el estudiante.
- Skill: competencia o dimensión evaluada, como vocabulario, gramática, lectura, escritura, comprensión auditiva o interacción.
- Activity: ejercicio concreto dentro de una lección.
- ExerciseItem: pregunta, estímulo, opciones, respuesta y explicación.
- ContentAsset: audio, imagen u otro recurso asociado a una actividad.
- Prerequisite: requisito previo para desbloquear contenido.
- ContentReview: estado y aprobación editorial.

### 5.2. Estado del estudiante

- CourseEnrollment: inscripción y versión del curso.
- LessonProgress: estado y resultados de una lección.
- ExerciseAttempt: cada intento, respuesta, corrección, pista utilizada y tiempo.
- LearnerSkillMastery: dominio estimado por competencia y objetivo.
- LearnerProfile: nivel inicial, metas, preferencias y disponibilidad.
- LearningPlan: plan de estudio vigente.
- LearningPlanItem: actividad recomendada y motivo.
- SrsCard / SrsReview: contenido pendiente y cada revisión.
- Achievement / UserAchievement: logros disponibles y obtenidos.
- DailyGoal / DailyActivity: meta diaria y actividad válida para cumplirla.
- LearningEvent: eventos académicos para progreso, analítica y proyecciones.

### 5.3. Conversaciones con IA

- Conversation: conversación, escenario, idioma y estado.
- ConversationTurn: mensaje del estudiante o del tutor.
- ConversationSummary: resumen mínimo para mantener continuidad cuando corresponda.
- TutorScenario: contexto, rol, objetivos, nivel y reglas del escenario.
- AIProviderUsage: proveedor, modelo, tokens/uso informado, latencia, coste estimado y resultado.
- AIRequest: identificador de correlación e idempotencia cuando sea aplicable.

Las conversaciones deben tener política configurable de retención, controles de eliminación y límites de tamaño. No se enviará al proveedor información de perfil que no sea necesaria para el turno actual.

### 5.4. Reglas de persistencia

- Todas las entidades propiedad de usuario deben tener aislamiento efectivo por usuario y pruebas RLS.
- Las relaciones deben usar claves foráneas e índices que respondan a consultas reales.
- Las operaciones que cambian estado académico y recompensas deben ser transaccionales o idempotentes.
- Los eventos críticos se deben persistir mediante outbox/inbox cuando sea necesario evitar pérdidas o duplicados entre PostgreSQL y mensajería.
- Los contenidos publicados deben quedar versionados: una edición posterior no puede cambiar silenciosamente el significado de resultados históricos.
- Las fechas académicas y rachas deben usar zona horaria explícita por usuario.
- Las migraciones deben ser compatibles con despliegues graduales y rollback cuando técnicamente sea posible.

---

# 6. Fases de implementación

## Fase 0 — Descubrimiento, inventario y diseño técnico

### Objetivo

Establecer una línea base verificable del producto, su arquitectura y su calidad antes de evolucionar el dominio académico. Los pendientes de validación operativa se mantienen visibles y trazables, pero no detienen el inicio de la Fase 1.

### Subfases

#### 0.1. Auditoría funcional

- [x] Mapear cada pantalla, caso de uso, endpoint, RPC y tabla que participa en el flujo.
- [x] Identificar funciones completas, parciales, simuladas, duplicadas o sin uso.
- [x] Revisar los flujos de registro, login, curso, lección, progreso, SRS, tutor, logros y perfil.
- [x] Identificar valores hardcodeados, datos de demostración y fallbacks silenciosos.
- [x] Elaborar una matriz requisito → módulo → endpoint/RPC → migración → prueba.

#### 0.2. Auditoría de arquitectura

- [x] Documentar responsabilidades y dependencias de cada microservicio.
- [x] Verificar si Redis y NATS/JetStream se utilizan efectivamente y para qué.
- [x] Identificar llamadas síncronas que puedan convertirse en eventos sin perder consistencia.
- [x] Revisar límites de conexión, timeouts, reintentos, circuit breakers y shutdown ordenado.
- [x] Documentar las unidades systemd y sus variables de entorno sin exponer secretos.

#### 0.3. Decisiones de arquitectura

- [x] Registrar ADR del modelo curricular.
- [x] Registrar ADR del modelo de dominio del aprendizaje.
- [x] Registrar ADR del motor de evaluación y dominio académico.
- [x] Registrar ADR del adaptador de proveedores conversacionales.
- [x] Registrar ADR de eventos y consistencia.
- [x] Registrar ADR de privacidad y retención de conversaciones.

#### 0.4. Línea base de calidad

- [x] Ejecutar CI completo sobre el árbol de código del commit de partida (CI #174).
- [x] Registrar duración y resultado de CI completo (CI #174: 3 min 40 s; 72 tests pasaron).
- [x] Medir cobertura actual de Rust y frontend (CI #202; resultados documentados abajo).
- [x] Establecer fixtures reproducibles de usuarios y contenidos de prueba.
- [x] Definir datos sintéticos reproducibles para pruebas de carga.
- [x] Definir métricas iniciales para comparar antes y después.
- [x] Añadir un escenario k6 de smoke para disponibilidad de BFF; su alcance es únicamente `GET /health`, no una prueba de capacidad.
- [x] Implementar en código los límites configurables de espera de PostgreSQL, deadlines gRPC y timeouts de Bedrock/Transcribe, con pruebas deterministas (PR #69).
- [ ] Ejecutar recorridos E2E completos y pruebas de integración/recuperación en un entorno controlado.
- [ ] Verificar llamadas reales y fallos de cada proveedor externo habilitado.
- [ ] Ejecutar carga representativa y registrar throughput, latencia p50/p95/p99 y tasa de errores.
- [ ] Confirmar los valores efectivos de configuración y comportamiento de las dependencias en las VMs de prueba.

### Entregables

- Inventario funcional y técnico.
- Diagramas C4 de contexto, contenedores y componentes relevantes.
- Matriz de trazabilidad.
- ADR aprobados.
- Línea base de CI y cobertura.
- Fixtures y generador de datos sintéticos reproducibles.
- Escenario k6 de smoke y definición de métricas de rendimiento.
- Matriz de límites, errores y configuración de dependencias.

### Pruebas y aceptación

- [x] La matriz incluye todos los flujos actualmente expuestos.
- [x] No hay endpoints o RPC críticos sin propietario documentado.
- [x] Las dependencias activas tienen límites de espera y manejo de errores implementados en código, con pruebas deterministas donde corresponde.
- [x] CI completo pasa sobre el árbol de código de partida.
- [x] Se registraron las métricas de cobertura y existen fixtures reproducibles.
- [ ] Los flujos críticos tienen recorridos E2E e integración ejecutados en un entorno representativo.
- [ ] Los fallos, latencia y recuperación de proveedores/dependencias se verificaron en ejecución.
- [ ] Existe una medición de rendimiento/carga representativa; el smoke de salud no la sustituye.

### Estado de Fase 0 al 2026-11-16

- 0.1 Auditoría funcional: inventario estático y matriz de trazabilidad completados. Las diferencias entre capacidades completas, parciales y simuladas quedaron registradas; la ejecución E2E se difiere.
- 0.2 Auditoría de arquitectura: responsabilidades, dependencias, riesgos de consistencia y systemd documentados. PR #69 añadió límites SQLx, deadlines gRPC y límites Bedrock/Transcribe; su comportamiento operativo real sigue pendiente de validación.
- 0.3 Decisiones: ADR-0001 a ADR-0006 aceptados. ADR-0006 difiere las duraciones de retención y el consentimiento concreto hasta antes de persistir conversaciones.
- 0.4 Línea base: cobertura Rust de 45,09% de líneas y 29,55% de funciones; cobertura frontend TypeScript de dominio/aplicación/infraestructura/shared de 30,71% de líneas, 65,71% de ramas y 13,41% de funciones. Se añadieron fixtures y generador sintético reproducible (PR #68). Estos valores son una línea base, no umbrales de aceptación.
- El smoke k6 existente consulta únicamente `GET /health`; todavía no acredita capacidad, latencias bajo carga ni SLO.
- Los límites añadidos por PR #69 tienen pruebas deterministas, pero aún faltan fallos controlados, recuperación y llamadas reales con Polly, Transcribe y Bedrock. Cloudflare TTS ya tuvo un smoke real en Deploy #32.

### Pendientes diferidos — no bloquean el inicio de Fase 1

Se mantienen abiertos para ejecución y cierre posterior, en paralelo con el trabajo de las siguientes fases:

1. Recorridos E2E de registro, autenticación, perfil, contenido, lecciones, progreso, SRS, gamificación y audio.
2. Pruebas de integración de contratos HTTP/gRPC, persistencia, permisos, aislamiento, idempotencia, concurrencia y efectos parciales entre SRS y Gamification.
3. Fallos controlados de PostgreSQL, deadlines gRPC y proveedores externos; timeout, desconexión, cuota/rate limit y recuperación.
4. Pruebas reales de Polly, Transcribe y Bedrock, además de revalidación del proveedor TTS seleccionado.
5. Carga representativa con k6 y medición de throughput, p50/p95/p99, errores y recuperación.
6. Verificación en las VMs de prueba de las variables y límites efectivos, sin usar producción como entorno de carga.

**Decisión de continuidad:** estos pendientes no son un gate de entrada para la Fase 1. Se pueden definir el currículo, el catálogo y el modelo académico mientras se prepara la infraestructura de prueba y se ejecutan las validaciones pendientes. No se declara cerrada la Fase 0 hasta registrar sus evidencias de cierre.

Los cambios nuevos de cada fase sí deben incluir sus propias pruebas unitarias, de integración, migración y aceptación según el alcance que incorporen. Los flujos existentes documentados como simulados o incompletos no se deben tratar como comportamiento correcto ni usarse como dependencia funcional sin resolverlos.

**Gate de continuidad: FASE 1 AUTORIZADA. Fase 0 permanece abierta con validaciones diferidas no bloqueantes.**

---

## Fase 1 — Currículo, contenido y catálogo académico

### Objetivo

Convertir el conjunto de palabras y preguntas existente en un currículo estructurado, progresivo, versionado y revisable.

**Condición de inicio:** la Fase 1 está autorizada aunque permanezcan pendientes diferidos de Fase 0. El diseño curricular, la organización del catálogo y el modelado académico pueden avanzar. Las migraciones, endpoints y flujos nuevos deben incluir sus propias pruebas de migración, contrato, integración y aceptación; no deben heredar como correctos los comportamientos simulados documentados en la auditoría.

### Subfase 1.1. Definición del currículo

- [x] Definir la ruta general desde Pre-A1/A0 hasta C1 y la extensión C2.
- [x] Definir la ruta tecnológica y su relación con los niveles generales.
- [x] Definir cursos, unidades, temas, objetivos y resultados esperados.
- [x] Definir vocabulario receptivo y productivo por nivel, con rangos internos sujetos a validación editorial.
- [x] Definir gramática por nivel y prerequisitos.
- [x] Definir objetivos de lectura, escritura, comprensión auditiva, expresión hablada e interacción.
- [x] Definir tamaño de curso/unidad/lección, cantidad y dificultad de actividades por objetivo.
- [x] Definir criterios de desbloqueo, recuperación, repaso y evaluación de unidad.
- [x] Definir reglas de progresión espiral para evitar saltos de dificultad y repetición innecesaria.

**Entregable:** [Blueprint curricular de Fase 1.1](../curriculum/phase-1.1-curricular-blueprint.md) — propuesta v1.0 para revisión del producto. Las cantidades léxicas y los umbrales de rúbrica son metas internas provisionales; no equivalen a estándares oficiales del MCER y se calibrarán en el piloto.

### Subfase 1.2. Modelo y migraciones

- [x] Diseñar entidades académicas y relaciones en el modelo de persistencia.
- [x] Crear una migración aditiva y compatible sin alterar las tablas actuales.
- [x] Versionar cursos y contenido publicado con inscripción fijada a CourseVersion.
- [x] Agregar estados draft, review, published y archived con transiciones/inmutabilidad.
- [x] Agregar metadatos de nivel, tema, competencia, objetivo y prerequisito.
- [x] Crear índices iniciales de integridad y acceso para las consultas previstas.
- [ ] Medir planes de consulta y ajustar índices no únicos con datos representativos en staging.
- [x] Aplicar RLS forzado a matrículas y políticas de lectura de contenido publicado/edición.
- [x] Crear pruebas automatizadas desde base vacía y desde la secuencia de migraciones actualmente versionada.

**Entregable:** [Modelo de dominio y persistencia de Fase 1.2](../curriculum/phase-1.2-domain-persistence-model.md) y migración `20261117000000_curriculum_catalog.sql`.

**Pendientes de evidencia operativa:** el esquema `20261117000000_curriculum_catalog.sql` ya está integrado y forma parte de las migraciones desplegadas. Sin embargo, no se debe inferir de ese despliegue que se ejecutaron las dos validaciones de staging/backup. La comprobación de planes requiere datos representativos en staging; la comprobación de migración requiere una copia aislada restaurada desde un backup anterior a Fase 1.2. Los procedimientos están en [Validación operativa de Fase 1.2](../curriculum/phase-1.2-operations-validation.md). Como la migración ya llegó a producción, el gate previo solo puede acreditarse retroactivamente si se conserva un backup pre-1.2; si no existe, debe registrarse explícitamente esa limitación. No marcar estos criterios como completados sin sus informes.

### Subfase 1.3. Gestión y validación de contenido

**Estado:** **completada técnicamente el 2026-11-18**, integrada en `main` y desplegada en la VM de producción. El contrato y validador se incorporaron en PR #75; la importación transaccional en PR #77; la exportación y el flujo editorial en PR #78; y la integridad de publicación/inmutabilidad en PR #79. CI #308 validó la PR final, CI #309 pasó sobre el commit integrado y Deploy #46 aplicó las migraciones y superó los health checks de producción. El alcance aceptado comprende validación offline, resolución contra el catálogo PostgreSQL, importación transaccional a `draft`, exportación relacional verificable y revisión/publicación con identidad de editor registrada. La evidencia y los límites operativos están en [el acta de aceptación de 1.3](../curriculum/phase-1.3-acceptance.md).

**Contrato y validación**
- [x] Definir el formato canónico v1 para paquetes de importación/exportación.
- [x] Validar estructura, campos requeridos, identificadores, tipos, longitudes, referencias internas y duplicados.
- [x] Validar grafo de prerrequisitos sin ciclos y referencias de objetivos sin elementos huérfanos.
- [x] Normalizar SHA-256 sin depender de espacios, orden de claves ni orden de relaciones sin posición.
- [x] Mantener el validador offline, reproducible y sin efectos sobre PostgreSQL.

**Importación**
- [x] Resolver referencias externas a vocabulario y frases existentes; rechazar referencias ausentes o ambiguas.
- [x] Crear únicamente versiones nuevas en estado `draft`.
- [x] Hacer la importación transaccional e idempotente, con serialización de importaciones concurrentes.
- [x] Rechazar sobrescritura de una versión existente con contenido diferente.
- [x] Registrar autoría, fecha, fuente, licencia, versión de formato, SHA-256 e información necesaria para exportar el paquete sin pérdida.
- [x] Mantener el modo dry-run por defecto y requerir `--apply` explícito para persistir.
- [x] No modificar vocabulario/frases legadas, matrículas, tarjetas SRS ni progreso del estudiante.

**Exportación**
- [x] Reconstruir un paquete canónico desde las relaciones de PostgreSQL.
- [x] Validar el paquete exportado y comprobar que su SHA-256 coincide con el ledger del paquete importado.
- [x] Ejecutar la lectura bajo una única instantánea consistente de base de datos.
- [x] Fallar de forma explícita si una relación almacenada no puede representarse en el contrato v1, en lugar de perder datos silenciosamente.

**Revisión y publicación**
- [x] Registrar editores autorizados en `content_editors`; el GUC `app.content_editor` por sí solo no concede autorización.
- [x] Enviar versiones draft a revisión mediante CLI administrativo.
- [x] Registrar decisiones append-only (`approved`, `rejected`, `changes_requested`) con revisor y comentarios.
- [x] Devolver a draft las versiones que requieren cambios o fueron rechazadas.
- [x] Publicar solo cuando la última decisión sea approved y corresponda al mismo editor que publica.
- [x] Mantener todas las acciones editoriales en dry-run salvo que se indique `--apply`.
- [x] Preservar inmutabilidad y transiciones permitidas mediante triggers de PostgreSQL.
- [x] Congelar todas las filas hijas al entrar en revisión; permitir su edición nuevamente solo después de volver a `draft`.
- [x] Revalidar en PostgreSQL la integridad académica al publicar, incluso si los cambios se realizaron fuera del importador o del CLI.

**Pruebas**
- [x] Pruebas de importación, rollback, dry-run, idempotencia, no sobrescritura, referencias externas y concurrencia.
- [x] Pruebas de exportación round-trip, preservación de campos opcionales y detección de drift relacional.
- [x] Pruebas de autorización de editores y del ciclo draft → review → changes_requested/draft → approved → publish (dry-run de publicación).
- [x] Pruebas de migración desde base vacía y desde el esquema anterior.
- [x] Pruebas de regresión que bloquean la publicación de unidades vacías, lecciones sin objetivo requerido/criterio, objetivos huérfanos, competencias primarias inválidas o relaciones opcionales no representables por el paquete v1.
- [x] Pruebas de congelación del contenido durante `review` y de reapertura de edición tras `changes_requested`/retorno a `draft`.

**Límites deliberados**
- La coherencia entre objetivos y ejercicios/respuestas se cerrará cuando exista el contrato de actividades de Fase 2.
- La curación lingüística de traducciones, ejemplos, explicaciones, fonética y audios pertenece a la Subfase 1.4; el importador valida estructura y referencias, no certifica calidad pedagógica.
- El CLI editorial aporta operación segura y trazable; la pantalla/API administrativa se realizará como parte de la Subfase 1.5.
- El registro inicial de editores se provisiona por una acción administrativa de base de datos documentada; no se concede el rol automáticamente a un usuario.

### Subfase 1.4. Curación y expansión del catálogo

**Estado: CERRADA para el alcance de la primera liberación piloto aprobada e integrada en `main` el 2026-11-20 (PR #90, #92 y #93).** La fuente v2 reúne 790 unidades léxicas (704 trasladadas/deduplicadas y 86 nuevas), 2.201 ejemplos, 26 categorías y 26 recursos graduados. El catálogo se importó desde CI/CD y se publicó una selección privada controlada: 30 términos, 26 ejemplos, 4 recursos, 12 preguntas y 2 audios Listening, en dos versiones English General PRE_A1 y A1. No se publicó el resto del catálogo. El inventario, distribución por nivel y backlog posterior al piloto están en [Catálogo léxico y recursos graduados v2](../curriculum/phase-1.4-catalog-audit.md).

**Integración del panel estudiantil 1.1–1.4 (PR #90 y #92):** los filtros por ruta/nivel/categoría, metadatos léxicos v2, controles duales sujetos a aprobación editorial y biblioteca Reading/Listening quedaron integrados en `main`; CI y despliegue de la carga inicial se completaron mediante PR #93. La matriz de pantallas, APIs y límites está en [Integración frontend estudiantil 1.1–1.4](../curriculum/phase-1.1-1.4-student-frontend-integration.md).

**Modelo, auditoría y procedencia**
- [x] Consolidar el catálogo en una fuente JSON v2 y retirar los tres JSON semilla anteriores, las claves antiguas y el alias persistido A0.
- [x] Definir una taxonomía canónica compartida de 26 categorías con etiquetas español/inglés.
- [x] Separar nivel, rutas, tipo léxico, prioridad pedagógica, utilidad, registro, contextos y frecuencia de corpus.
- [x] Detectar identidades léxicas duplicadas, posiciones/ejemplos repetidos dentro de unidad, y reportar ejemplos ingleses compartidos y significados españoles repetidos como advertencias sin borrado automático.
- [x] Auditar campos heredados de pronunciación y preservarlos únicamente como candidatos no aprobados; desactivar el motor heurístico de conversión.
- [x] Bloquear rangos numéricos de frecuencia mientras no exista cotejo validado de lema, POS y sentido.

**Backlog de expansión posterior al piloto (no reabre el alcance 1.4 ya aprobado)**
- [ ] Revisar por persona competente traducciones, significado, naturalidad, registro, categoría gramatical, nivel y todos los ejemplos de las 790 unidades (2.201 ejemplos).
- [ ] Ejecutar y revisar el cruce exacto de los 709 candidatos unigrama con NGSL 1.2 y NGSL-Spoken 1.2 mediante el script reproducible, conservando atribución, CC BY-SA 4.0, hash y metodología. Los lemas modificados de las listas agregan categorías gramaticales y no representan una frecuencia por sentido; no derivar rangos con fuzzy matching. Las 81 expresiones multi-palabra quedan fuera de listas unigramas.
- [ ] Aprobar individualmente las guías lenta/natural para hispanohablantes y agregar notas de sonidos que no existen en español; no publicar aproximaciones automáticas.
- [ ] Alcanzar y validar el presupuesto léxico interno acumulado de la ruta general. La fuente actual registra 237 PRE_A1, 462 A1, 7 A2, 7 B1, 7 B2, 6 C1 y 6 C2 en General; el déficit de A2–C2 sigue siendo importante.
- [ ] Completar los dominios de la ruta Tecnología en A1–C2 con vocabulario/expresiones contextualizadas, objetivos y progresión curricular aprobada.
- [x] Crear 86 unidades iniciales adicionales: expresiones funcionales, sentence frames, collocations, phrasal verbs, marcadores discursivos y términos técnicos.
- [x] Crear 13 lecturas y 13 guiones originales de listening con ruta, nivel, foco y perfil de dificultad.
- [x] Añadir generador gRPC TTS en lote con dry-run, límite de 1.000 caracteres, validación MP3, manifiesto SHA-256/proveedor/voz y estado obligatorio `generated_pending_audio_review`; no modifica catálogo/DB ni publica archivos.
- [ ] Revisar editorialmente las 52 preguntas, sus distractores y claves; comprobar que miden comprensión y no lectura del transcript.
- [ ] Generar y revisar los 13 audios de listening, registrar voz/acento/licencia y validar su correspondencia con el guion y sus preguntas de comprensión.
- [ ] Crear fixtures por nivel y tipo de ejercicio al quedar definido el contrato común de actividades en Fase 2.

**Persistencia e integración**

- [x] Conectar la consulta de vocabulario publicado con filtros por ruta, nivel y categoría, paginación y metadatos de catálogo v2 en el panel del estudiante.
- [x] Exponer el RPC de recursos graduados mediante BFF autenticado y crear biblioteca estudiantil de Reading/Listening; la API elimina claves de respuesta y no entrega transcripción de listening.
- [x] Mostrar guías de pronunciación lenta/natural únicamente con aprobación editorial del vocabulario y del ejemplo; ambos audios parten del texto inglés original.
- [x] Retirar del BFF las rutas heredadas de lección sintética y finalización ficticia; el panel registra práctica mediante el flujo persistente de progreso.
- [x] Validar CI y despliegue de la primera liberación con contenido real: PR #93 ejecutó la carga curricular desde CI/CD y completó el deploy productivo. La aceptación manual de la experiencia del estudiante se mantiene en el checklist operativo correspondiente.
- [x] Añadir migración PostgreSQL v2 para conservar procedencia, frecuencia, estados editoriales, ejemplos y recursos graduados; preservar las filas heredadas para no romper referencias SRS, pero marcarlas como pendientes de revisión.
- [x] Añadir importador transaccional/idempotente con dry-run por defecto, ledger SHA-256 y comprobación de editor registrado para aplicar.
- [x] Hacer que el servicio de contenido consulte solo vocabulario y ejemplos publicados; los datos heredados y los importados como draft quedan fuera de las respuestas estudiantiles.
- [x] Bloquear en base de datos la publicación de vocabulario/ejemplos sin aprobación editorial y pronunciación aprobada o explícitamente no requerida; listening publicado requiere asset real aprobado.
- [x] Ejecutar la migración e importación inicial mediante CI/CD en producción, con la identidad editorial técnica provisionada para la carga.
- [x] Completar revisión, aprobación y publicación privada de la selección piloto inicial. El resto del catálogo permanece oculto y requiere curación independiente antes de una futura publicación.
- [x] Ejecutar CI para migración, auditoría, importación transaccional y regresiones antes de integrar PR #93.

**Pruebas y aceptación**
- [x] Auditor estricto de esquema, categorías, niveles, identidades duplicadas, estados de publicación, frecuencia no verificada y listening sin audio aprobado.
- [x] Pruebas para taxonomía canónica y reportes de ejemplos compartidos/traducciones repetidas.
- [x] Pruebas de seguridad de publicación: los registros pendientes no pueden entrar en resultados de vocabulario publicados.
- [ ] Evidencia CI verde de migración desde base vacía y desde esquema anterior, dry-run, importación completa, autorización, idempotencia y filtros del servicio.
- [ ] Evidencia editorial de revisión y cobertura curricular suficiente, más audios reales revisados.

**Criterio de cierre cumplido para el alcance aprobado:** la infraestructura, el catálogo de 790 entradas y el piloto privado de Inglés General quedaron integrados y desplegados mediante PR #90, #92 y #93. La ampliación completa de niveles/ruta Tecnología, curación lingüística individual y revisión de audios que no forman parte del piloto quedan como backlog editorial posterior; no reabren la entrega piloto aceptada. No hay un entorno staging configurado en este proyecto.

### Subfase 1.5. APIs y administración

**Estado: IMPLEMENTACIÓN INTEGRADA; aceptación manual con cuentas reales PENDIENTE.** No existe un entorno staging configurado. La implementación y sus pruebas automatizadas están en `main`; las comprobaciones HTTP/navegador con identidades reales se realizarán posteriormente en la aplicación productiva, por el usuario, y no se marcarán como aprobadas hasta registrar evidencia.

**Avance incremental — catálogo estudiantil (PR #81) y APIs/administración web:** se conservan las rutas existentes, se expone el catálogo por versión inmutable y se incorporan filtros/paginación PostgreSQL, progreso de lecciones basado en evidencia persistida y una administración web protegida para importar, editar borradores, tramitar revisión y publicar. La edición de borradores es transaccional, usa un token de concurrencia y conserva revisiones SHA-256 append-only. La implementación y sus límites están en [Catálogo curricular y administración editorial web](../curriculum/phase-1.5-student-catalog-integration.md).

**Estado integrado en `main` (PR #81, #82, #94, #96 y #97):**
- [x] Exponer catálogo de cursos, unidades y lecciones para estudiantes.
- [x] Exponer detalle por versión exacta, objetivos, competencias y prerrequisitos.
- [x] Exponer estado de desbloqueo calculado con eventos de vocabulario y revisiones SRS persistidas.
- [x] Exponer catálogo paginado y filtrado en PostgreSQL (ruta, nivel, búsqueda y matrículas).
- [x] Crear cola editorial web con autorización comprobada contra `content_editors`.
- [x] Exponer importación web canónica v1 con previsualización transaccional y confirmación explícita como `draft`.
- [x] Tramitar submit, approved, changes_requested, rejected y publish mediante API; publicación exige la última aprobación del mismo editor y las restricciones de PostgreSQL.
- [x] Versionar contratos HTTP/gRPC y mantener intacto el recorrido legado `/learn`.

**Validaciones manuales pendientes para completar la subfase 1.5:**
- [x] Editor visual campo a campo de una versión `draft` ya importada, con guardado transaccional, validación de estructura inmutable, token de concurrencia e historial append-only con SHA-256.
- [x] Prueba de integración PostgreSQL del guardado de borrador: revisión persistida, rechazo de escritura obsoleta y bloqueo tras entrar a `review`.
- [x] Mantener un smoke test HTTP que recorre el ciclo editorial con dos cuentas reales, pero protegido para staging aislado porque crea y deja publicado un curso de aceptación. No debe ejecutarse contra producción.
- [x] Suite E2E visual en Chromium integrada a CI: login requerido, 403 visible, paginación, búsqueda, filtros, importación, edición del borrador, revisión, aprobación y publicación (BFF simulado para determinismo).
- [x] Auditoría automática completa del catálogo fuente en CI: 790 entradas, 2.201 ejemplos, 26 recursos Reading/Listening y 52 preguntas; la auditoría no convierte ítems pendientes en contenido aprobado/publicado.
- [ ] Comprobar en producción, con la cuenta editorial real, acceso a `/admin/curriculum`, carga de cola, filtros/paginación y edición únicamente de borradores.
- [ ] Comprobar con una cuenta sin permiso que la API y la interfaz deniegan el acceso (403), sin revelar versiones editoriales.
- [ ] Validar con un borrador seguro el dry-run, importación, edición, conflicto 409, solicitud de cambios, reenvío, aprobación y publicación; no publicar fixtures ni cursos ficticios.
- [ ] Verificar que el curso aprobado aparece en el catálogo estudiantil y que una versión publicada no admite edición posterior.
- [ ] Revocar temporalmente la capacidad editorial de la cuenta de prueba y verificar que el acceso vuelve a ser 403; restaurar el permiso solo mediante el procedimiento administrativo autorizado.
- [ ] Registrar fecha, cuentas/roles (sin contraseñas), versión curricular y evidencia de la aceptación manual.

**Operación:** se retiró el workflow manual de staging porque no existe ese entorno. `tools/curriculum/acceptance-smoke.mjs` conserva su bloqueo de producción: crea y publica un curso de aceptación y solo debe utilizarse en un staging aislado si se configura en el futuro.

**Límite de progreso:** el desbloqueo usa eventos de palabras completadas y repetición SM-2 exitosa sobre frases. La cobertura SM-2 es práctica/retención, no una calificación general de competencia. La evaluación de gramática, escritura, listening y speaking con intentos y rúbricas pertenece al motor de actividades de Fase 2.

**Contenido real — release piloto (PR #93):** la carga inicial ya se ejecuta desde CI/CD y el despliegue de producción terminó correctamente. Se importaron 790 entradas léxicas, 2.201 ejemplos y 26 recursos de comprensión; la publicación privada inicial quedó limitada a 30 términos, 26 ejemplos, 4 recursos, 12 preguntas y 2 audios Listening. Se publicaron las dos versiones English General PRE_A1 y A1, con 6 unidades, 10 lecciones y 10 objetivos en total. Los 760 términos y el resto de recursos no incluidos en el piloto permanecen ocultos. Esta publicación es un piloto privado para validación personal, no una certificación editorial para lanzamiento público: las guías fonéticas siguen requiriendo revisión especializada y los audios/licencias TTS requieren escucha y validación manual. La evidencia detallada está en [Carga inicial de Inglés General y catálogo de contenido](../curriculum/initial-content-release.md).

### Pruebas y aceptación

- [x] Pruebas de esquema para cada tipo de contenido del paquete canónico v1.
- [x] Pruebas de importación idempotente en el CLI existente.
- [x] Pruebas de duplicados y referencias inválidas en el contrato canónico.
- [x] Pruebas de publicación y versionado en PostgreSQL/CI existentes.
- [x] Pruebas de permisos editor/estudiante y RLS del modelo editorial en PostgreSQL.
- [x] Pruebas unitarias frontend para mapeadores de paginación/progreso/acciones/importación.
- [ ] Ejecutar la validación HTTP y visual de las rutas BFF/gRPC y transacciones PostgreSQL en producción con cuentas reales; la realizará el usuario después del merge y se documentará aquí.
- [x] Pruebas E2E del navegador sobre la experiencia de administración en Chromium con BFF simulado; la repetición contra la web desplegada con identidades reales permanece pendiente.
- [x] Validación estructural del catálogo fuente completo en CI. La aprobación y publicación de contenido editorial se mantiene separada de la mera importación.
- [x] Ninguna lección publicada carece de objetivo requerido y criterio de finalización; PostgreSQL lo bloquea y CI prueba el rechazo.

**Gate de salida:** la implementación ya está integrada; la Subfase 1.5 permanece abierta únicamente por la aceptación manual HTTP/visual con cuentas reales en producción y su evidencia. No declarar DONE antes de marcar esos puntos.

---

## Fase 2 — Motor de lecciones y ejercicios

### Objetivo

Construir un motor reutilizable que permita presentar actividades diferentes bajo un mismo modelo de ejecución, registro y corrección.

### Subfase 2.1. Contrato de actividad

- [x] Definir un contrato común de actividad: estímulo, instrucciones, opciones, respuesta esperada, pistas y explicación.
- [x] Definir validación de entrada y salida por tipo de ejercicio.
- [x] Definir soporte de puntuación parcial donde aplique.
- [x] Definir retroalimentación inmediata y explicación posterior.
- [x] Definir límites de tiempo y número de intentos cuando el diseño pedagógico lo requiera.
- [x] Versionar el formato de actividades.

**Aceptación (PR #95):** el contrato está integrado en `main` y CI quedó verde para el commit `8244928b22b6fe2482d0f57350d30224939bbd5c`. Incluye definición privada de actividad, proyección segura para estudiante, 13 tipos de ejercicio tipados, modalidades diferenciadas, validación de respuesta, puntuación parcial, políticas de feedback, límites, idempotencia y referencia a la versión exacta del contenido. La compilación y las pruebas Rust pasan. La subfase 2.1 queda aceptada en su alcance de contrato; no incluye persistencia de intentos, endpoints, sesiones ni UI, que corresponden a las siguientes subfases.

### Subfase 2.2. Tipos de ejercicio

Implementar como mínimo:

- [ ] Selección múltiple.
- [ ] Selección de traducción en ambas direcciones.
- [ ] Completar espacios.
- [ ] Ordenar palabras para construir oraciones.
- [ ] Relacionar palabra, significado, contexto o expresión.
- [ ] Escuchar audio y responder preguntas de comprensión.
- [ ] Dictado o transcripción de fragmentos con comparación de texto.
- [ ] Lectura con preguntas de comprensión.
- [ ] Transformación gramatical de oraciones.
- [ ] Corrección de errores gramaticales.
- [ ] Respuesta escrita abierta con rúbrica y evaluación controlada.
- [ ] Diálogo guiado por turnos.
- [ ] Repaso de vocabulario mediante recuperación activa.

Cada tipo debe tener instrucciones claras, estados de carga, error, respuesta correcta, respuesta incorrecta, explicación y finalización.

### Subfase 2.3. Evaluación de respuestas

- [ ] Calificar ejercicios cerrados en backend mediante reglas deterministas.
- [ ] Normalizar mayúsculas, espacios y puntuación solo cuando el tipo lo permita.
- [ ] Definir equivalencias aceptadas de forma explícita.
- [ ] No aceptar respuestas por coincidencia aproximada sin reglas transparentes.
- [ ] Incorporar rúbricas a respuestas abiertas.
- [ ] Validar la salida de IA contra esquemas tipados.
- [ ] Registrar resultado, puntuación, explicación, pistas y versión de la regla/rúbrica.
- [ ] Separar errores de contenido, formato, red y proveedor.
- [ ] Permitir reintento sin duplicar progreso o recompensas.

### Subfase 2.4. Sesiones de lección

- [ ] Crear un motor de sesión con inicio, actividad actual, respuesta, corrección, avance y finalización.
- [ ] Recuperar una sesión interrumpida cuando sea válido.
- [ ] Guardar estado en backend; no depender únicamente del estado React.
- [ ] Evitar doble envío y doble puntuación.
- [ ] Registrar tiempo activo sin contar pausas indefinidas como estudio.
- [ ] Mostrar progreso real de la sesión.
- [ ] Permitir salir sin perder resultados confirmados.

### Subfase 2.5. Feedback educativo

- [ ] Mostrar por qué una respuesta es correcta.
- [ ] Explicar los errores de forma adecuada al nivel.
- [ ] Ofrecer pistas graduadas.
- [ ] Mostrar ejemplos equivalentes.
- [ ] Reforzar patrones de error frecuentes.
- [ ] Evitar explicaciones largas en ejercicios simples.
- [ ] Permitir consultar más detalle bajo demanda.

### Subfase 2.6. Sistema Dual de Pronunciación para Hispanohablantes

- [ ] Integrar un componente reutilizable que muestre primero la palabra o frase original en inglés.
- [ ] Mostrar la guía aproximada para hispanohablantes asociada a la pronunciación lenta y ofrecer el control **Escuchar lentamente**.
- [ ] Mostrar la guía aproximada para hispanohablantes asociada a la pronunciación natural y ofrecer el control **Escuchar a velocidad natural**.
- [ ] Permitir repetir cada audio sin reiniciar la actividad ni perder el progreso.
- [ ] Mantener sincronizados texto original, guía de pronunciación, audio, acento y versión del contenido.
- [ ] Implementar el audio lento con articulación clara y sin distorsión que cambie la identidad de los sonidos.
- [ ] Implementar el audio natural con ritmo, acentuación y enlaces propios del habla conversacional.
- [ ] Evitar convertir automáticamente letras inglesas en sonidos españoles mediante reglas simplistas; las guías deben ser específicas del contenido y revisables.
- [ ] Añadir notas breves para fonemas difíciles para hispanohablantes cuando sean relevantes, sin saturar al estudiante con explicaciones.
- [ ] Permitir que el estudiante siga el ciclo escuchar lento → repetir → escuchar natural → repetir.
- [ ] Integrar el componente en vocabulario, frases, lecciones y ejercicios apropiados sin duplicar contenido ni crear un microservicio innecesario.
- [ ] Reutilizar el servicio TTS y su selector actual; la configuración conversacional Cloudflare/AWS no debe alterar la selección de TTS.
- [ ] Definir fallback explícito cuando falte una de las versiones de audio: no mostrar un control que no pueda reproducir y no fingir que el audio existe.
- [ ] Registrar errores de reproducción y métricas técnicas sin almacenar audio personal de práctica por defecto.
- [ ] Verificar que la función ayuda a practicar, pero no genera ni altera puntuaciones de pronunciación en evaluaciones.

### Pruebas y aceptación

- [ ] Pruebas unitarias por tipo de ejercicio.
- [ ] Pruebas de respuestas válidas, inválidas, ambiguas y límites.
- [ ] Pruebas de puntuación parcial.
- [ ] Pruebas de persistencia y recuperación de sesión.
- [ ] Pruebas de idempotencia ante doble clic, retry y reconexión.
- [ ] Pruebas de accesibilidad de teclado y lector de pantalla.
- [ ] Pruebas E2E de una lección completa de cada familia.
- [ ] Ningún ejercicio puede conceder recompensas antes de confirmar el resultado en backend.

**Gate de salida:** todos los tipos de ejercicio acordados funcionan de extremo a extremo, registran intentos y ofrecen feedback correcto.

---

## Fase 3 — Diagnóstico, evaluación académica y dominio

### Objetivo

Conocer el punto de partida del estudiante y mantener una estimación verificable de sus competencias.

### Subfase 3.1. Diagnóstico inicial

- [ ] Crear un diagnóstico de ubicación por nivel.
- [ ] Medir vocabulario, gramática, lectura, escritura y comprensión auditiva con actividades apropiadas.
- [ ] Ajustar dificultad según las respuestas del estudiante.
- [ ] Evitar pruebas innecesariamente largas.
- [ ] Permitir continuar o repetir diagnóstico bajo reglas claras.
- [ ] Guardar versión de prueba, respuestas, dificultad, puntuación y fecha.
- [ ] Entregar nivel estimado, fortalezas, áreas por trabajar y confianza de la estimación.
- [ ] Distinguir evaluación inicial de progreso durante el curso.

### Subfase 3.2. Evaluaciones de unidad y curso

- [ ] Crear evaluación breve al final de cada unidad.
- [ ] Crear evaluaciones acumulativas.
- [ ] Incluir recuperación de objetivos anteriores.
- [ ] Definir criterios de aprobación por objetivo, no solo una nota promedio.
- [ ] Evitar que una puntuación alta en una habilidad oculte una debilidad importante en otra.
- [ ] Permitir revisión de respuestas y explicación de errores.
- [ ] Registrar los cambios de dominio a lo largo del tiempo.

### Subfase 3.3. Modelo de dominio

- [ ] Calcular dominio por objetivo y competencia.
- [ ] Considerar aciertos, fallos, dificultad, intentos, pistas y antigüedad de la evidencia.
- [ ] Separar conocimiento reciente de retención demostrada.
- [ ] Definir mínimos de evidencia para marcar un objetivo como dominado.
- [ ] Definir estados: not_started, learning, needs_review, mastered.
- [ ] Permitir pérdida de confianza o descenso de dominio cuando nuevas evidencias lo justifiquen.
- [ ] Explicar al usuario qué evidencias sustentan el estado.
- [ ] No equiparar nivel de juego con nivel CEFR.

### Subfase 3.4. Rúbricas y calibración

- [ ] Crear rúbricas para ejercicios abiertos de escritura e interacción textual.
- [ ] Versionar instrucciones y rúbricas.
- [ ] Crear ejemplos etiquetados para validar consistencia.
- [ ] Comparar evaluación automatizada con revisión humana en una muestra.
- [ ] Medir falsos positivos y falsos negativos.
- [ ] Definir umbrales conservadores para promociones de nivel.
- [ ] No presentar un resultado incierto como medición exacta.

### Subfase 3.5. Evaluación con modalidades escrita y hablada

La evaluación debe ofrecer dos modalidades explícitas. Cada modalidad tendrá rúbricas y resultados propios; no se debe reutilizar una misma puntuación como si las dos modalidades midieran las mismas evidencias.

**Modalidad escrita**

- [ ] Evaluar cumplimiento de la consigna, gramática, vocabulario, construcción de oraciones, coherencia y adecuación comunicativa según el tipo de actividad.
- [ ] Utilizar el texto enviado por el estudiante como evidencia principal.
- [ ] No asignar puntuaciones de pronunciación ni de fluidez oral cuando no exista una grabación analizable.
- [ ] No presentar una métrica oral no medida como cero; utilizar un estado explícito como `not_measured` o `not_applicable`.

**Modalidad hablada**

- [ ] Capturar y procesar la grabación de voz del estudiante además de obtener una transcripción.
- [ ] Evaluar pronunciación a partir de evidencia acústica de la grabación, no únicamente de las palabras reconocidas por STT.
- [ ] Evaluar fluidez oral con señales observables del audio, como continuidad, ritmo y pausas; una transcripción de texto por sí sola no demuestra fluidez.
- [ ] Utilizar la transcripción como evidencia complementaria para contenido, vocabulario, gramática y cumplimiento de la consigna.
- [ ] Si el audio no está disponible, es demasiado corto, tiene calidad insuficiente o no permite una medición fiable, marcar las métricas afectadas como no evaluables e informar el motivo.
- [ ] No inferir una pronunciación correcta o incorrecta solo porque el motor STT haya reconocido una palabra.
- [ ] Informar qué evidencias sustentan cada métrica y la confianza de la estimación cuando corresponda.

**Comprensión auditiva (listening)**

- [ ] Crear actividades específicas en las que la evidencia principal sea escuchar un audio y responder preguntas de comprensión.
- [ ] No mostrar la transcripción ni revelar la respuesta en el estímulo antes de que el estudiante responda.
- [ ] Cuando el texto de la pregunta esté visible o pueda leerse en lugar de escucharse, no afirmar que la respuesta demuestra comprensión auditiva.
- [ ] Definir por actividad si se permite repetir el audio y si se presenta una vez o varias, según el objetivo pedagógico.

**Reglas comunes**

- [ ] Definir rúbricas, dimensiones y criterios de puntuación adecuados a cada modalidad y nivel CEFR.
- [ ] Mantener resultados separados para escrito y hablado; comparar únicamente dimensiones compartidas cuando exista calibración válida.
- [ ] No utilizar la guía fonética ni los audios de práctica del Sistema Dual como evidencia de la pronunciación producida por el estudiante.
- [ ] Informar claramente qué modalidad se realizó, qué competencias se midieron y cuáles quedaron sin medir.
- [ ] Obtener y procesar el audio de forma segura, aplicar límites de retención y permitir su eliminación conforme a la política de privacidad.
- [ ] Mantener el modo de evaluación explícito en el intento, la rúbrica, los resultados y el historial.

### Pruebas y aceptación

- [ ] Pruebas de selección de preguntas por nivel.
- [ ] Pruebas de cálculo del dominio con escenarios reproducibles.
- [ ] Pruebas de separación de competencias.
- [ ] Pruebas de evidencia insuficiente.
- [ ] Pruebas de que la modalidad escrita nunca asigna puntuación de pronunciación o fluidez oral sin audio.
- [ ] Pruebas de que la modalidad hablada entrega audio real al evaluador y no solamente la transcripción.
- [ ] Pruebas con transcripciones iguales y audios con pronunciación diferente para comprobar que la pronunciación se evalúa desde el audio.
- [ ] Pruebas de que la fluidez oral no se calcula únicamente a partir del texto transcrito.
- [ ] Pruebas de que listening requiere un estímulo auditivo y no revela la transcripción antes de responder.
- [ ] Pruebas de audio ausente, corrupto, insuficiente o no evaluable y de estados `not_measured` / `not_applicable`.
- [ ] Pruebas de que los resultados identifican modalidad, evidencia y métricas efectivamente medidas.
- [ ] Pruebas de consistencia entre historial y estado actual.
- [ ] Pruebas de que XP no modifica el nivel académico.
- [ ] Pruebas de propiedad, autorización y RLS.
- [ ] Pruebas de regresión con perfiles de estudiantes ficticios de distintos niveles.

**Gate de salida:** el sistema puede crear un diagnóstico, mantener el perfil de dominio y explicar los resultados usando evidencias persistidas.

---

## Fase 4 — Repetición espaciada y memoria a largo plazo

### Objetivo

Convertir el SRS actual en un sistema de repaso integrado con el currículo y con resultados de memoria medibles.

### Subfase 4.1. Integración con el contenido

- [ ] Relacionar tarjetas con palabras, expresiones, oraciones y objetivos.
- [ ] Crear tarjetas automáticamente al completar actividades que lo ameriten.
- [ ] Evitar crear tarjetas duplicadas.
- [ ] Permitir añadir y retirar elementos del mazo.
- [ ] Separar contenido nuevo, aprendido, vencido y suspendido.
- [ ] Mantener el vínculo con la versión del contenido.

### Subfase 4.2. Motor de planificación

- [ ] Mantener SM-2 como estrategia inicial detrás de una interfaz de scheduler.
- [ ] Separar el cálculo del intervalo de la persistencia.
- [ ] Definir zona horaria y momento de vencimiento.
- [ ] Manejar respuestas Otra vez, Difícil, Bien y Fácil.
- [ ] Evitar fechas inválidas, intervalos negativos y overflow.
- [ ] Diseñar la interfaz para poder evaluar otro algoritmo en el futuro sin migrar toda la aplicación.
- [ ] Evaluar FSRS con datos de retención y simulaciones antes de decidir una sustitución.
- [ ] No cambiar de algoritmo sin comparar retención, carga diaria y estabilidad.

### Subfase 4.3. Sesión de repaso

- [ ] Priorizar tarjetas vencidas.
- [ ] Mezclar recuperación de vocabulario y contexto cuando sea pedagógicamente adecuado.
- [ ] Evitar sobrecargar al estudiante con nuevas tarjetas.
- [ ] Mostrar por qué aparece cada tarjeta.
- [ ] Registrar tiempo, respuesta y evaluación.
- [ ] Dar explicaciones breves después del intento.
- [ ] Permitir pausar y reanudar la sesión.
- [ ] Adaptar la carga diaria a la disponibilidad configurada.

### Subfase 4.4. Medición de retención

- [ ] Medir acierto en primera recuperación.
- [ ] Medir olvido después de intervalos.
- [ ] Medir carga de tarjetas vencidas.
- [ ] Medir retención por nivel, objetivo y tipo de contenido.
- [ ] Ajustar parámetros solo mediante experimentos y evidencia.
- [ ] Mostrar al estudiante qué debe repasar hoy y cuánto tiempo estima.

### Pruebas y aceptación

- [ ] Pruebas unitarias con reloj controlado.
- [ ] Pruebas de límites de intervalos y factores.
- [ ] Pruebas de concurrencia y doble envío.
- [ ] Pruebas de tarjetas duplicadas.
- [ ] Pruebas de migración de datos SRS existentes.
- [ ] Pruebas de zona horaria y cambio de día.
- [ ] Pruebas de consistencia entre revisión SRS y eventos de progreso.
- [ ] Simulaciones de calendarios y retención.

**Gate de salida:** el estudiante recibe repasos pertinentes y las revisiones se registran sin pérdidas ni duplicados.

---

## Fase 5 — Tutor conversacional con proveedor intercambiable

### Objetivo

Crear un tutor de inglés que converse con el estudiante, respete sus objetivos y nivel, y pueda utilizar Cloudflare Workers AI o AWS Bedrock mediante configuración de entorno.

### 5.1. Requisito principal de selección de proveedor

El proveedor conversacional debe seleccionarse desde el archivo de entorno mediante una variable independiente:

- CONVERSATIONAL_AI_PROVIDER=cloudflare
- CONVERSATIONAL_AI_PROVIDER=aws

El valor seleccionado determina qué adaptador se construye y utiliza. No se debe acoplar la selección conversacional a TTS_PROVIDER: la síntesis de voz y el modelo conversacional son capacidades independientes y deben poder utilizar proveedores distintos.

Ambos adaptadores deben quedar implementados y probados. No basta con dejar interfaces vacías o stubs.

### 5.2. Configuración de entorno

Variables comunes:

- CONVERSATIONAL_AI_PROVIDER: cloudflare o aws.
- CONVERSATIONAL_AI_TIMEOUT_SECONDS: timeout total de la llamada.
- CONVERSATIONAL_AI_MAX_OUTPUT_TOKENS: límite superior de salida.
- CONVERSATIONAL_AI_TEMPERATURE: parámetro de generación validado.
- CONVERSATIONAL_AI_MAX_HISTORY_TURNS: máximo de turnos enviados al proveedor.
- CONVERSATIONAL_AI_STREAMING_ENABLED: habilita streaming cuando el adaptador y el modelo lo soporten.
- CONVERSATIONAL_AI_MAX_REQUEST_CHARS: límite de entrada.
- CONVERSATIONAL_AI_MAX_CONCURRENT_REQUESTS: límite de concurrencia por instancia.

Cloudflare Workers AI:

- CLOUDFLARE_ACCOUNT_ID.
- CLOUDFLARE_API_TOKEN.
- CLOUDFLARE_AI_CONVERSATION_MODEL: identificador configurable del modelo conversacional.

AWS Bedrock:

- AWS_REGION.
- AWS_BEDROCK_CONVERSATION_MODEL_ID: identificador configurable del modelo conversacional.
- Credenciales obtenidas mediante la cadena estándar del SDK de AWS.
- En EC2, preferir un IAM instance profile/role con permisos mínimos sobre el modelo y región necesarios.
- En desarrollo local, usar perfiles AWS o credenciales de desarrollo administradas de forma segura; nunca commitear claves.

Los nombres anteriores deben documentarse en un ejemplo de configuración sin valores secretos. No se deben guardar tokens, claves, sesiones ni credenciales reales en Git.

La configuración del proveedor conversacional es independiente de las variables de TTS existentes. Se debe poder usar, por ejemplo, conversación mediante AWS y síntesis mediante Cloudflare, o conversación mediante Cloudflare y síntesis mediante AWS.

### 5.3. Arquitectura de proveedores

- [ ] Definir un contrato de dominio independiente del SDK de Cloudflare y del SDK de AWS.
- [ ] Definir mensajes normalizados: system, developer, user y assistant, según el contrato interno.
- [ ] Definir respuesta normalizada con texto, identificador del modelo, proveedor, uso disponible, duración y metadatos seguros.
- [ ] Definir streaming mediante eventos normalizados si se soporta.
- [ ] Implementar CloudflareWorkersAIProvider con la API oficial de Workers AI.
- [ ] Implementar AwsBedrockProvider usando Bedrock Converse o la API apropiada del SDK.
- [ ] Implementar un selector/factory validado al arrancar.
- [ ] Validar la configuración requerida solo para el proveedor seleccionado.
- [ ] Fallar al iniciar con un error claro si la configuración del proveedor elegido es inválida.
- [ ] No realizar fallback silencioso a otro proveedor.
- [ ] No exponer detalles del SDK ni respuestas crudas a los casos de uso.
- [ ] Normalizar errores de autenticación, cuota, rate limit, timeout, proveedor no disponible y respuesta inválida.
- [ ] No registrar prompt completo, secretos, tokens ni datos personales en logs.
- [ ] Registrar proveedor, modelo, latencia, identificador de correlación y uso informado por el proveedor cuando esté disponible.

### 5.4. Comportamiento del tutor

- [ ] Permitir conversación guiada y práctica libre.
- [ ] Permitir seleccionar objetivo: conversación general, viaje, trabajo, entrevista, reuniones y escenarios tecnológicos.
- [ ] Utilizar el nivel del estudiante para elegir vocabulario y complejidad.
- [ ] Explicar en español o inglés según la preferencia.
- [ ] Corregir de manera contextual y amable.
- [ ] Evitar interrumpir continuamente al estudiante con demasiadas correcciones.
- [ ] Permitir elegir un modo de corrección: suave, equilibrado o detallado.
- [ ] Formular preguntas de seguimiento para mantener una conversación natural.
- [ ] Proponer una actividad posterior derivada de errores observados.
- [ ] Diferenciar información recordada, contexto del turno actual y suposiciones.
- [ ] No inventar hechos del perfil o del historial.
- [ ] Ofrecer cierre con resumen y objetivos para la siguiente sesión.

### 5.5. Escenarios y roles

Crear escenarios versionados con:

- Rol del tutor.
- Rol del estudiante.
- Contexto.
- Objetivo comunicativo.
- Nivel recomendado.
- Vocabulario permitido o sugerido.
- Restricciones y criterios de finalización.
- Rúbrica de feedback.
- Duración estimada.

Escenarios iniciales:

- Presentarse y conocer a alguien.
- Pedir información y resolver situaciones de viaje.
- Restaurante, hotel y transporte.
- Conversación cotidiana.
- Reunión de equipo.
- Stand-up diario.
- Code review.
- Explicar una decisión técnica.
- Entrevista conductual.
- Entrevista técnica.
- Presentar un proyecto.

### 5.6. Persistencia y privacidad

- [ ] Persistir conversaciones y turnos con propietario y controles de acceso.
- [ ] Guardar solo el historial necesario para continuidad.
- [ ] Resumir conversaciones largas con resúmenes compactos y versionados.
- [ ] Permitir eliminar conversaciones.
- [ ] Definir retención configurable y documentada.
- [ ] Evitar enviar identificadores personales innecesarios al proveedor.
- [ ] Sanitizar entradas y limitar longitud, frecuencia y concurrencia.
- [ ] Protegerse contra prompt injection en contenido del usuario y contenido recuperado.
- [ ] No permitir que el modelo cambie permisos, XP, monedas, nivel o estado de curso por sí mismo.
- [ ] Toda mutación de dominio debe pasar por un caso de uso y validación del backend.

### 5.7. Costes, límites y resiliencia

- [ ] Medir consumo por usuario, conversación, proveedor y modelo.
- [ ] Definir límites diarios/mensuales configurables.
- [ ] Mostrar errores recuperables al usuario.
- [ ] Aplicar timeout, cancelación y límite de salida.
- [ ] Usar retry acotado solo para fallos transitorios seguros.
- [ ] Evitar reintentos duplicados que generen cargos innecesarios.
- [ ] Implementar rate limiting por usuario y por instancia.
- [ ] Definir política de circuit breaker si las métricas justifican su uso.
- [ ] Mantener el proveedor elegido fijo durante una petición; no cambiarlo a mitad de conversación.
- [ ] Añadir endpoint de diagnóstico interno que no exponga secretos ni realice llamadas costosas por defecto.

### 5.8. Pruebas de proveedores

- [ ] Suite de contrato común para ambos adaptadores.
- [ ] Tests unitarios con cliente HTTP/SDK simulado.
- [ ] Tests de payloads correctos y respuestas malformadas.
- [ ] Tests de token/credencial inválida.
- [ ] Tests de timeout, 429, 5xx y proveedor no disponible.
- [ ] Tests de límite de tokens y entrada máxima.
- [ ] Tests de streaming, cancelación y desconexión si está habilitado.
- [ ] Tests de selección por CONVERSATIONAL_AI_PROVIDER.
- [ ] Tests de configuración Cloudflare sin credenciales AWS.
- [ ] Tests de configuración AWS sin token Cloudflare.
- [ ] Tests de que TTS_PROVIDER no cambia el proveedor conversacional.
- [ ] Smoke tests reales opt-in para Cloudflare y AWS, ejecutados únicamente cuando existan secretos protegidos.
- [ ] CI normal sin necesidad de credenciales reales de terceros.

### 5.9. Criterios de aceptación

- [ ] Cambiar CONVERSATIONAL_AI_PROVIDER selecciona efectivamente el proveedor deseado.
- [ ] Ambos adaptadores responden con el mismo contrato interno.
- [ ] Ambos pueden utilizarse sin tener que reescribir casos de uso.
- [ ] Ninguna clave secreta aparece en el frontend, logs, errores o artefactos.
- [ ] El sistema falla de forma explícita ante configuración inválida.
- [ ] Las pruebas de contrato de ambos proveedores pasan.
- [ ] El tutor conserva el contexto dentro de límites definidos.
- [ ] El usuario puede consultar y eliminar sus conversaciones.
- [ ] El coste y latencia de cada proveedor son observables.

**Gate de salida:** tutor funcional con los dos proveedores reales implementados, seleccionables por entorno, con pruebas, privacidad, límites y telemetría.

---

## Fase 6 — Personalización y recomendador de aprendizaje

### Objetivo

Construir un plan de aprendizaje que seleccione la siguiente actividad a partir del nivel, objetivos, disponibilidad y evidencias del estudiante.

### Subfase 6.1. Preferencias y objetivos

- [ ] Configurar objetivo: general, laboral, tecnológico, viaje o mixto.
- [ ] Configurar tiempo diario disponible.
- [ ] Configurar días preferidos.
- [ ] Configurar idioma de explicaciones.
- [ ] Configurar modo de corrección del tutor.
- [ ] Configurar objetivo semanal.
- [ ] Permitir cambiar preferencias sin perder historial.

### Subfase 6.2. Motor de recomendación

- [ ] Definir entradas deterministas del recomendador.
- [ ] Priorizar objetivos pendientes y prerequisitos.
- [ ] Priorizar repasos vencidos cuando corresponda.
- [ ] Alternar práctica nueva y recuperación.
- [ ] Reducir carga cuando el estudiante no pueda cumplir el plan.
- [ ] Evitar recomendar contenidos ya dominados sin razón.
- [ ] Incluir variedad de competencias.
- [ ] Explicar la razón de cada recomendación.
- [ ] Definir límites para evitar bucles de recomendación.
- [ ] Versionar la política de recomendación.
- [ ] Mantener reglas reproducibles antes de introducir recomendaciones generativas.

### Subfase 6.3. Generación de plan

- [ ] Crear plan diario y semanal.
- [ ] Incluir lección principal, repaso, actividad complementaria y conversación cuando corresponda.
- [ ] Estimar duración a partir de datos observados.
- [ ] Recalcular el plan cuando se complete, omita o repruebe una actividad.
- [ ] Permitir posponer una actividad.
- [ ] Evitar castigar al usuario por cambiar su disponibilidad.
- [ ] Registrar versión y motivos del plan.

### Subfase 6.4. Ejercicios de refuerzo

- [ ] Construir ejercicios desde objetivos fallidos reales.
- [ ] Usar el resultado guardado y no una lista fija de debilidades.
- [ ] Seleccionar ejemplos del nivel correcto.
- [ ] Reforzar un concepto a la vez.
- [ ] Verificar que los ejercicios generados coinciden con el objetivo.
- [ ] Validar salida estructurada de IA y tener fallback determinista.
- [ ] Registrar si el refuerzo corrigió el error posteriormente.

### Pruebas y aceptación

- [ ] Pruebas deterministas con perfiles de entrada conocidos.
- [ ] Pruebas de disponibilidad diaria distinta.
- [ ] Pruebas de objetivos dominados, pendientes y vencidos.
- [ ] Pruebas de ausencia de ciclos.
- [ ] Pruebas de explicabilidad de recomendaciones.
- [ ] Pruebas de regeneración de plan e idempotencia.
- [ ] Pruebas de que las debilidades proceden de resultados reales.
- [ ] Pruebas E2E desde diagnóstico hasta plan diario y refuerzo.

**Gate de salida:** cada estudiante recibe un plan explicable y dinámico construido con sus datos reales.

---

## Fase 7 — Gamificación y motivación sostenible

### Objetivo

Evolucionar XP, monedas, rachas y logros hacia un sistema de motivación justo que incentive aprendizaje real.

### Subfase 7.1. Economía de puntos

- [ ] Definir catálogo de acciones que generan XP.
- [ ] Definir límites diarios y reglas antiabuso.
- [ ] Premiar objetivos dominados y sesiones completas.
- [ ] Evitar recompensar repetición vacía o llamadas automatizadas.
- [ ] Hacer las recompensas idempotentes.
- [ ] Registrar ledger de recompensas y motivo.
- [ ] Separar recompensas académicas de recompensas cosméticas.
- [ ] Validar cualquier mutación en servidor.

### Subfase 7.2. Metas y rachas

- [ ] Crear objetivos diarios configurables.
- [ ] Calcular rachas con zona horaria del usuario.
- [ ] Definir qué acciones cuentan como día válido.
- [ ] Soportar días de descanso si se decide en producto.
- [ ] Evitar perder racha por fallos técnicos del sistema.
- [ ] Permitir consultar calendario de actividad.
- [ ] Enviar recordatorios configurables y respetuosos.

### Subfase 7.3. Misiones y logros

- [ ] Crear misiones diarias y semanales.
- [ ] Crear logros por competencias y objetivos dominados.
- [ ] Crear logros por constancia y participación.
- [ ] Crear progresión de unidades y cursos.
- [ ] Versionar las reglas de cada logro.
- [ ] Evitar conceder logros varias veces.
- [ ] Permitir auditar la razón por la que se concedió cada logro.

### Subfase 7.4. Ligas y clasificación

- [ ] Definir temporadas y ventanas de clasificación.
- [ ] Separar usuarios por grupos razonables.
- [ ] Evitar que la clasificación premie únicamente volumen de clics.
- [ ] Definir reglas antiabuso y desempate.
- [ ] Garantizar privacidad de perfiles.
- [ ] Probar cálculos ante eventos repetidos y concurrencia.

### Pruebas y aceptación

- [ ] Pruebas unitarias de economía y niveles.
- [ ] Pruebas de zona horaria y cambio de día.
- [ ] Pruebas de recompensas duplicadas.
- [ ] Pruebas de concurrencia.
- [ ] Pruebas de ledger y auditoría.
- [ ] Pruebas de abuso y límites.
- [ ] Pruebas E2E de metas, misiones, logros y clasificación.
- [ ] XP no puede promover automáticamente el nivel académico.

**Gate de salida:** recompensas y rachas son correctas, auditables, idempotentes y están vinculadas a actividad válida.

---

## Fase 8 — Experiencia de usuario, interfaz y móvil

### Objetivo

Convertir las funcionalidades en una experiencia coherente, intuitiva y rápida.

### Subfase 8.1. Arquitectura de navegación

- [ ] Diseñar mapa de cursos y unidades.
- [ ] Diseñar página de lección y sesión de ejercicios.
- [ ] Diseñar centro de práctica y repasos.
- [ ] Diseñar tutor conversacional.
- [ ] Diseñar dashboard académico y progreso.
- [ ] Integrar la ruta tecnológica sin confundirla con el curso general.
- [ ] Eliminar rutas de demostración y datos mock cuando exista backend real.
- [ ] Centralizar estados de carga, error, vacío y éxito.

### Subfase 8.2. Dashboard académico

- [ ] Mostrar plan para hoy.
- [ ] Mostrar objetivo diario y semanal.
- [ ] Mostrar tareas pendientes.
- [ ] Mostrar progreso por competencia.
- [ ] Mostrar cursos y unidades.
- [ ] Mostrar repasos vencidos.
- [ ] Mostrar continuidad de estudio.
- [ ] Diferenciar dominio académico, nivel de curso y nivel de gamificación.

### Subfase 8.3. Interacción y feedback

- [ ] Mostrar progreso de sesión en tiempo real.
- [ ] Evitar bloqueos visuales al enviar respuestas.
- [ ] Mostrar explicaciones legibles.
- [ ] Permitir reproducir recursos de audio.
- [ ] Integrar el Sistema Dual de Pronunciación con controles diferenciados para escucha lenta y natural, junto con sus guías legibles.
- [ ] Hacer evidente que la guía escrita es una aproximación pedagógica y no la escritura correcta del inglés ni una transcripción IPA.
- [ ] Mantener separadas visualmente la práctica de pronunciación y la evaluación hablada.
- [ ] Mostrar en los resultados si la evaluación fue escrita o hablada y qué métricas no pudieron medirse.
- [ ] Diseñar estados de conexión y recuperación.
- [ ] Dar navegación clara entre ejercicio, corrección y siguiente actividad.
- [ ] Evitar mostrar información que aún no se ha confirmado en backend.

### Subfase 8.4. Diseño responsive y PWA

- [ ] Optimizar para móvil, tablet y escritorio.
- [ ] Crear manifest, iconos y service worker si corresponde.
- [ ] Definir caché segura para contenido público y estático.
- [ ] No cachear respuestas privadas o sensibles de manera insegura.
- [ ] Permitir una experiencia degradada cuando haya desconexión, sin confirmar operaciones no persistidas.
- [ ] Definir sincronización segura cuando el usuario vuelva a estar conectado.
- [ ] Revisar formularios, teclado virtual y foco.

### Subfase 8.5. Accesibilidad y calidad visual

- [ ] Cumplir objetivos de accesibilidad WCAG 2.2 AA.
- [ ] Navegación completa por teclado.
- [ ] Etiquetas y nombres accesibles.
- [ ] Contraste de texto y estados.
- [ ] Mensajes de error asociados a campos.
- [ ] Respetar reducción de movimiento.
- [ ] Verificar lectores de pantalla.
- [ ] Evitar depender únicamente del color.
- [ ] Mantener consistencia visual en todos los módulos.

### Pruebas y aceptación

- [ ] Pruebas de componentes.
- [ ] Pruebas responsive en anchos representativos.
- [ ] Pruebas de navegación y refresh de rutas.
- [ ] Pruebas E2E con usuario nuevo y usuario recurrente.
- [ ] Pruebas de accesibilidad automatizadas y manuales.
- [ ] Pruebas de rendimiento frontend.
- [ ] Pruebas de desconexión y reintento.
- [ ] Ninguna pantalla principal muestra datos hardcodeados como progreso real.

**Gate de salida:** los flujos principales son utilizables de principio a fin en móvil y escritorio con criterios de accesibilidad satisfechos.

---

## Fase 9 — Observabilidad, seguridad y operación de producción

### Objetivo

Asegurar que la plataforma pueda mantenerse, diagnosticarse, recuperarse y escalar con evidencia.

### Subfase 9.1. Observabilidad

- [ ] Usar logs estructurados con correlation_id y trace_id.
- [ ] Instrumentar HTTP, gRPC, PostgreSQL, Redis, NATS y llamadas a proveedores IA.
- [ ] Incorporar OpenTelemetry donde corresponda.
- [ ] Medir latencia p50/p95/p99.
- [ ] Medir errores por endpoint, RPC y proveedor.
- [ ] Medir colas, reintentos y mensajes pendientes.
- [ ] Medir uso de CPU, memoria y conexiones.
- [ ] Crear dashboards y alertas accionables.
- [ ] No registrar datos personales, contenido completo de conversaciones ni secretos.

### Subfase 9.2. Seguridad

- [ ] Revisar autenticación, autorización y renovación/revocación de sesiones.
- [ ] Revisar RLS en todas las tablas con datos por usuario.
- [ ] Revisar validación de entradas y límites de payload.
- [ ] Revisar rate limits por endpoint y proveedor.
- [ ] Revisar CORS, headers, cookies y protección CSRF donde aplique.
- [ ] Revisar permisos IAM mínimos para Bedrock.
- [ ] Revisar tokens Cloudflare con permisos mínimos.
- [ ] Separar secretos por ambiente.
- [ ] Ejecutar análisis de dependencias y secretos.
- [ ] Documentar tratamiento, retención y eliminación de datos.
- [ ] Probar acceso cruzado entre usuarios en endpoints y RPC.
- [ ] Probar abuso de recompensas y solicitudes IA.

### Subfase 9.3. Resiliencia de dependencias

- [ ] Definir timeout por dependencia.
- [ ] Definir política de reintentos por operación.
- [ ] Evitar reintentar escrituras no idempotentes sin protección.
- [ ] Manejar pérdida temporal de Redis y mensajería.
- [ ] Manejar caída de un proveedor IA con errores recuperables.
- [ ] Definir degradación funcional sin datos falsos.
- [ ] Definir límites de pools y backpressure.
- [ ] Implementar graceful shutdown.
- [ ] Probar reconexión tras reinicio de procesos.

### Subfase 9.4. Datos y recuperación

- [ ] Automatizar backups de PostgreSQL.
- [ ] Proteger y verificar backups.
- [ ] Definir retención y rotación.
- [ ] Probar restauración en ambiente aislado.
- [ ] Documentar RPO/RTO aprobados.
- [ ] Probar recuperación de Redis y mensajería según su rol.
- [ ] Verificar consistencia de eventos/outbox después de recuperar.
- [ ] Documentar procedimiento de recuperación.

### Subfase 9.5. Rendimiento

- [ ] Crear pruebas de carga para login, catálogo, lecciones, SRS, progreso y tutor.
- [ ] Medir consultas más costosas.
- [ ] Evitar N+1 y payloads excesivos.
- [ ] Optimizar paginación y caché.
- [ ] Definir límites de concurrencia de IA.
- [ ] Medir rendimiento con volúmenes crecientes de contenido e historial.
- [ ] Establecer SLO iniciales y revisarlos con los resultados de carga.
- [ ] No establecer metas de capacidad sin medición reproducible.

### Subfase 9.6. Despliegue y rollback

- [ ] Mantener compilación de binarios Rust y frontend en CI.
- [ ] Mantener despliegue sin Docker en las VMs de aplicación.
- [ ] Validar configuración de entorno antes de reiniciar servicios.
- [ ] Ejecutar migraciones de forma controlada.
- [ ] Realizar health checks de servicios y rutas principales.
- [ ] Comprobar compatibilidad de migraciones antes de promover la versión.
- [ ] Mantener artefactos anteriores para rollback.
- [ ] Evitar despliegue si falla CI.
- [ ] No desplegar ante cambios exclusivos de documentación.
- [ ] Documentar procedimiento de rollback y probarlo.

### Pruebas y aceptación

- [ ] Pruebas de integración con dependencias reales en CI cuando sea viable.
- [ ] Pruebas de carga y estabilidad.
- [ ] Pruebas de recuperación y restauración.
- [ ] Pruebas de caída de proveedor IA.
- [ ] Pruebas de reinicio y shutdown.
- [ ] Pruebas de permisos, RLS y rate limits.
- [ ] Pruebas de migración y rollback.
- [ ] Smoke tests post-deploy.
- [ ] Alertas verificadas con eventos de prueba.
- [ ] Runbooks de incidentes documentados.

**Gate de salida:** la plataforma puede desplegarse, observarse, recuperarse y diagnosticarse sin depender de intervención improvisada.

---

## Fase 10 — Validación integral y lanzamiento

### Objetivo

Comprobar que el producto funciona como un sistema educativo completo, no como un conjunto de pantallas independientes.

### Subfase 10.1. Recorridos E2E obligatorios

- [ ] Registro → diagnóstico → plan inicial.
- [ ] Seleccionar curso → iniciar unidad → completar lección.
- [ ] Responder ejercicios de todos los tipos → recibir corrección.
- [ ] Completar unidad → realizar evaluación → actualizar dominio.
- [ ] Abrir una palabra o frase y practicar con el Sistema Dual: escuchar lentamente, repetir y escuchar a velocidad natural.
- [ ] Verificar que el Sistema Dual está disponible en los contextos de vocabulario y frases definidos por el producto.
- [ ] Completar una evaluación escrita y comprobar que solo aparecen métricas sustentadas por texto.
- [ ] Completar una evaluación hablada y comprobar que el audio real se analiza junto con su transcripción.
- [ ] Completar un ejercicio de listening sin mostrar transcripción antes de la respuesta.
- [ ] Comprobar que una métrica sin evidencia suficiente aparece como no medida y no como una puntuación inventada.
- [ ] Crear tarjetas → recibir repaso → guardar revisión.
- [ ] Cometer errores → obtener ejercicios de refuerzo relevantes.
- [ ] Iniciar conversación → mantener varios turnos → finalizar → consultar resumen.
- [ ] Alternar proveedor conversacional Cloudflare/AWS mediante entorno.
- [ ] Cambiar TTS sin afectar el proveedor conversacional.
- [ ] Completar objetivo diario → conceder recompensa una sola vez.
- [ ] Consultar progreso, logros e historial.
- [ ] Eliminar una conversación y verificar que se respeta la política de retención.
- [ ] Verificar que un usuario no puede leer ni modificar datos de otro.

### Subfase 10.2. Pruebas de regresión

- [ ] Mantener los flujos de autenticación actuales.
- [ ] Mantener el funcionamiento de los servicios existentes.
- [ ] Mantener el SRS y migrar su estado correctamente.
- [ ] Mantener TTS y transcripción existentes.
- [ ] Mantener los contratos actuales mientras existan clientes que los utilicen.
- [ ] Ejecutar pruebas de compatibilidad frontend/backend/gRPC.
- [ ] Ejecutar CI completo.

### Subfase 10.3. Piloto y salida

- [ ] Definir grupo piloto y datos sintéticos/de prueba.
- [ ] Medir finalización de lecciones, retención y errores.
- [ ] Recoger feedback sin almacenar más datos personales de los necesarios.
- [ ] Corregir bloqueantes y problemas de accesibilidad.
- [ ] Validar costes reales por sesión de tutor.
- [ ] Validar límites de proveedores y capacidad.
- [ ] Publicar notas de versión y documentación de usuario.
- [ ] Aprobar lanzamiento solo con todos los gates anteriores satisfechos.

### Criterios finales

La plataforma solo se considera lista cuando:

- [ ] Las rutas generales y tecnológicas están disponibles según el alcance publicado.
- [ ] El contenido publicado está validado y versionado.
- [ ] Los tipos de actividad incluidos funcionan de extremo a extremo.
- [ ] El diagnóstico y dominio académico se basan en evidencias reales.
- [ ] El Sistema Dual de Pronunciación ofrece guías y audio lento/natural revisados para los contenidos incluidos en su alcance.
- [ ] Las evaluaciones escritas y habladas tienen modalidades, rúbricas y resultados separados.
- [ ] Pronunciación y fluidez oral solo se puntúan con evidencia de audio suficiente; listening se mide mediante tareas auditivas específicas.
- [ ] El SRS funciona con el catálogo y el historial.
- [ ] El tutor conversacional puede usar Cloudflare Workers AI y AWS Bedrock.
- [ ] El proveedor conversacional se puede seleccionar exclusivamente por configuración de entorno.
- [ ] La selección de proveedor conversacional no depende de TTS_PROVIDER.
- [ ] Los dos adaptadores pasan la misma suite de contrato.
- [ ] El plan personalizado utiliza historial y preferencias reales.
- [ ] Las recompensas son idempotentes y no alteran el nivel académico.
- [ ] Las pantallas principales son responsive y accesibles.
- [ ] Las pruebas de seguridad y aislamiento pasan.
- [ ] Hay backups y una restauración probada.
- [ ] Hay observabilidad, alertas y runbooks.
- [ ] CI completo pasa y el despliegue está verificado.
- [ ] No quedan TODO, mocks o fallbacks silenciosos en rutas de producción dentro del alcance.

---

# 7. Estrategia global de pruebas

Todas las fases deben aplicar una estrategia común.

## 7.1. Pruebas unitarias

- Dominio puro y reglas de negocio.
- Validadores y serializadores.
- Cálculo de puntuaciones y dominio.
- Scheduler SRS.
- Reglas de gamificación.
- Recomendaciones.
- Configuración de proveedores.

## 7.2. Pruebas de integración

- PostgreSQL y migraciones.
- RLS con distintos usuarios.
- Redis según sus usos reales.
- NATS/JetStream, outbox/inbox y consumidores.
- BFF contra servicios gRPC.
- Persistencia de intentos, sesiones y conversaciones.
- Configuración y errores de proveedores IA.

## 7.3. Pruebas de contrato

- Contratos protobuf/gRPC.
- Contratos HTTP/JSON del BFF.
- Esquemas de actividad.
- Contrato del tutor IA.
- Compatibilidad entre versiones.
- Contrato común de Cloudflare y Bedrock.

## 7.4. Pruebas de frontend

- Componentes y formularios.
- Estados de carga, error, vacío y éxito.
- Sesiones de lección.
- Navegación y persistencia.
- Responsive.
- Accesibilidad automatizada y revisión manual.
- Pruebas E2E con Playwright o herramienta equivalente.

## 7.5. Pruebas de seguridad

- Autenticación, autorización y expiración.
- RLS y acceso cruzado entre usuarios.
- Rate limiting y límites de payload.
- Manipulación de IDs.
- Repetición de operaciones.
- Secretos y datos personales en logs.
- Retención y eliminación.
- Permisos IAM y token Cloudflare.

## 7.6. Pruebas de carga y resiliencia

- Concurrencia de lecciones y consultas.
- Carga de catálogo y dashboard.
- Repasos y escrituras simultáneas.
- Tutor IA con límites de concurrencia.
- Rate limit y fallos de proveedor.
- Reinicio de servicios y recuperación de conexiones.
- Backups y restauración.

## 7.7. Reglas de calidad

- Toda regla crítica de dominio debe tener pruebas explícitas.
- No se aceptan pruebas que solo verifiquen que una función no lanza error.
- Los tests deben verificar resultados, persistencia, permisos y efectos secundarios.
- Las pruebas de integración deben usar bases y dependencias aisladas.
- Los tests no deben depender de la hora real ni del orden de ejecución cuando pueda controlarse.
- Los tests de IA deben ser deterministas con mocks en CI; pruebas reales son smoke tests opt-in.
- Los fallos se deben reproducir y corregir; no ocultarlos mediante retries ilimitados o skips.
- El umbral de cobertura debe definirse por módulo a partir de la línea base, aumentando progresivamente. Las reglas críticas deben tener cobertura completa de escenarios y ramas relevantes; el porcentaje global por sí solo no es criterio de aceptación.
- Cada bug corregido debe incluir una prueba de regresión.

## 7.8. Sistema Dual de Pronunciación

- Verificar que cada guía corresponde exactamente al texto inglés y al audio publicado.
- Verificar que las versiones lenta y natural son reproducibles y mantienen el mismo contenido lingüístico.
- Verificar que el audio lento no altera fonemas ni vuelve ininteligible la pronunciación.
- Verificar controles de repetición, estados de carga/error y accesibilidad.
- Verificar que los contenidos sin audio no presentan controles falsos.
- Revisar muestras de las guías aproximadas con validación editorial, especialmente en sonidos que no existen en español.

## 7.9. Evaluación escrita y hablada

- Mantener fixtures separados para respuestas escritas, grabaciones habladas y ejercicios de listening.
- Verificar que cada métrica se calcula únicamente con la evidencia que necesita.
- Verificar que una misma transcripción procedente de audios distintos no fuerza una puntuación de pronunciación idéntica.
- Verificar que los resultados no inventan métricas cuando falta audio o evidencia suficiente.
- Verificar aislamiento, consentimiento, límites de tamaño, retención y eliminación de grabaciones.
- Comparar calibración de rúbricas escritas y habladas por separado.

---

# 8. Integración continua y despliegue

## 8.1. CI

- [ ] Mantener clasificación de cambios por rutas.
- [ ] Ejecutar Rust cuando cambie código Rust, contratos, migraciones o archivos que afecten al build.
- [ ] Ejecutar frontend cuando cambien archivos frontend o dependencias asociadas.
- [ ] Ejecutar auditorías según el alcance de dependencias y en una ejecución programada.
- [ ] Ejecutar lint documental en cambios Markdown.
- [ ] Ejecutar pruebas de migraciones cuando cambien SQL.
- [ ] Ejecutar pruebas de contrato cuando cambien protobuf o contratos API.
- [ ] Mantener un job final obligatorio que falle si cualquier validación relevante falla.
- [ ] Los jobs omitidos solo se consideran válidos cuando el clasificador demuestra que no aplican.
- [ ] Añadir workflows de pruebas E2E, integración y carga según fase.
- [ ] No permitir que un cambio de documentación active un despliegue de aplicación.

## 8.2. CD

- [ ] Construir artefactos reproducibles.
- [ ] Desplegar binarios y frontend según la estructura actual de VMs.
- [ ] No instalar Docker como requisito de despliegue de las aplicaciones.
- [ ] Validar variables obligatorias y configuración del proveedor seleccionado.
- [ ] Ejecutar migraciones en la secuencia aprobada.
- [ ] Reiniciar únicamente servicios afectados cuando sea seguro.
- [ ] Verificar health checks y rutas funcionales.
- [ ] Guardar el resultado del despliegue y SHA desplegado.
- [ ] Detener el despliegue si una validación o health check falla.
- [ ] Mantener rollback de binarios y frontend.

---

# 9. Datos de configuración y operación

## 9.1. Configuración por ambiente

Separar configuración de desarrollo, CI, staging y producción.

La configuración debe:

- Validarse al iniciar.
- Tener defaults seguros y explícitos.
- Rechazar valores inválidos.
- Evitar secretos en logs.
- Distinguir configuración opcional de obligatoria.
- Documentar qué servicio consume cada variable.
- No hacer que un servicio requiera credenciales de un proveedor que no utiliza.

## 9.2. Proveedores independientes

Mantener independientes, como mínimo:

- Proveedor conversacional: Cloudflare Workers AI o AWS Bedrock.
- Proveedor TTS: configuración existente de AWS Polly o Cloudflare.
- Proveedor STT: configuración del servicio de transcripción existente.

Cada integración debe tener interfaz, configuración, errores, límites, métricas y pruebas propios.

## 9.3. Secretos

- No subir archivos de entorno reales.
- Mantener un ejemplo sin valores reales.
- Usar IAM roles y tokens de mínimo privilegio.
- Rotar credenciales expuestas.
- No reutilizar tokens con permisos excesivos.
- Evitar imprimir configuración sensible en logs de arranque.

---

# 10. Gestión de proyecto y control de avance

## 10.1. División de trabajo

Cada subfase debe convertirse en uno o más PR pequeños y revisables.

Reglas:

1. Un PR debe tener alcance acotado y describir la fase/subfase correspondiente.
2. Incluir migraciones, contratos, código y pruebas necesarias.
3. No mezclar grandes refactors con nuevas funcionalidades.
4. No modificar despliegue, secretos o infraestructura sin justificarlo.
5. No eliminar compatibilidad sin evidencia de que ya no hay consumidores.
6. No fusionar una fase si su CI está fallando.
7. Tras fusionar, revisar el CI de main y el estado del despliegue cuando corresponda.

## 10.2. Plantilla obligatoria para cada PR

- Fase y subfase:
- Objetivo:
- Estado previo:
- Cambios realizados:
- Migraciones:
- Contratos afectados:
- Pruebas agregadas:
- Pruebas ejecutadas y resultado:
- Riesgos:
- Configuración/variables nuevas:
- Compatibilidad:
- Plan de rollback:
- Evidencia de aceptación:

## 10.3. Seguimiento

Mantener una tabla de trazabilidad actualizada:

| ID | Requisito | Código/servicio | Prueba | CI | Estado |
|---|---|---|---|---|---|
| F1.1 | Currículo estructurado | Módulo académico | Unit/integration/E2E | Run | Pendiente |
| F2.1 | Contrato de actividad | Learning engine | Contract tests | Run | Pendiente |
| F5.1 | Selector Cloudflare/AWS | AI provider adapter | Provider contract tests | Run | Pendiente |
| F6.1 | Plan adaptativo | Recommendation engine | Unit/integration | Run | Pendiente |

Los estados permitidos son: pending, in_progress, blocked, in_review, done. Solo usar done cuando haya evidencia enlazada.

---

# 11. Definition of Done global

Una fase o subfase solo se puede marcar como DONE cuando todo lo siguiente sea verdadero:

- [ ] Todo el alcance funcional aprobado está implementado.
- [ ] No hay stubs, mocks de producción o respuestas hardcodeadas dentro del alcance.
- [ ] El backend valida permisos y reglas de negocio.
- [ ] El frontend consume datos reales.
- [ ] Los datos persisten correctamente.
- [ ] Las migraciones están aplicadas y probadas desde el estado anterior.
- [ ] Los contratos están documentados y son compatibles.
- [ ] Las pruebas unitarias, integración, contrato y E2E correspondientes pasan.
- [ ] Las pruebas de seguridad y RLS correspondientes pasan.
- [ ] Hay logs, métricas y trazas suficientes.
- [ ] Los errores son recuperables y no se ocultan.
- [ ] La documentación está actualizada.
- [ ] Las variables de entorno están documentadas.
- [ ] CI pasa en el PR y después de integrar en main.
- [ ] La verificación post-deploy pasa cuando haya cambios desplegables.
- [ ] La trazabilidad requisito → implementación → prueba → CI tiene evidencia.
- [ ] No quedan defectos críticos abiertos.

Un porcentaje de cobertura o una demostración manual no sustituye estos criterios.

---

# 12. Orden recomendado de ejecución

La secuencia recomendada es:

1. Fase 0: descubrir y documentar.
2. Fase 1: diseñar y versionar el currículo/contenido.
3. Fase 2: implementar el motor de ejercicios.
4. Fase 3: diagnóstico y dominio académico.
5. Fase 4: integrar SRS con el currículo y medir retención.
6. Fase 5: tutor conversacional con ambos proveedores reales.
7. Fase 6: personalización y recomendación.
8. Fase 7: gamificación basada en actividad válida.
9. Fase 8: consolidar la experiencia de producto.
10. Fase 9: endurecimiento operativo y de seguridad.
11. Fase 10: validación completa y lanzamiento.

Se pueden ejecutar tareas independientes en paralelo, pero no se debe implementar el recomendador definitivo antes de tener datos de dominio fiables, ni las recompensas académicas antes de tener eventos de aprendizaje idempotentes.

---

# 13. Resultado esperado

Al completar todas las fases, DevFluency debe ser una plataforma en la que:

- El estudiante tiene una ruta formativa clara desde nivel inicial hasta avanzado.
- Cada lección tiene objetivos y criterios verificables.
- Las actividades son variadas, progresivas y con retroalimentación.
- El aprendizaje queda registrado con evidencias.
- El repaso se programa y mide.
- El plan diario se adapta al estudiante.
- El tutor conversacional mantiene contexto y se adapta al nivel y escenario.
- Cloudflare Workers AI y AWS Bedrock están implementados como proveedores reales e intercambiables por configuración de entorno.
- El sistema de gamificación recompensa actividad educativa válida.
- El usuario puede entender qué ha aprendido, qué necesita practicar y por qué.
- La plataforma se puede desplegar, observar, mantener y recuperar con procedimientos documentados.
- Cada requisito tiene pruebas y evidencia de CI.

**Condición final:** el proyecto no se considera terminado hasta que la Fase 10 esté aprobada y todos los requisitos dentro del alcance tengan estado DONE con evidencia verificable.
