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

### 2.4. No objetivos

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

Establecer una línea base verificable antes de cambiar el comportamiento.

### Subfases

#### 0.1. Auditoría funcional

- [ ] Mapear cada pantalla, caso de uso, endpoint, RPC y tabla que participa en el flujo.
- [ ] Identificar funciones completas, parciales, simuladas, duplicadas o sin uso.
- [ ] Revisar los flujos de registro, login, curso, lección, progreso, SRS, tutor, logros y perfil.
- [ ] Identificar valores hardcodeados, datos de demostración y fallbacks silenciosos.
- [ ] Elaborar una matriz requisito → módulo → endpoint/RPC → migración → prueba.

#### 0.2. Auditoría de arquitectura

- [ ] Documentar responsabilidades y dependencias de cada microservicio.
- [ ] Verificar si Redis y NATS/JetStream se utilizan efectivamente y para qué.
- [ ] Identificar llamadas síncronas que puedan convertirse en eventos sin perder consistencia.
- [ ] Revisar límites de conexión, timeouts, reintentos, circuit breakers y shutdown ordenado.
- [ ] Documentar las unidades systemd y sus variables de entorno sin exponer secretos.

#### 0.3. Decisiones de arquitectura

- [ ] Registrar ADR del modelo curricular.
- [ ] Registrar ADR del modelo de dominio del aprendizaje.
- [ ] Registrar ADR del motor de evaluación y dominio académico.
- [ ] Registrar ADR del adaptador de proveedores conversacionales.
- [ ] Registrar ADR de eventos y consistencia.
- [ ] Registrar ADR de privacidad y retención de conversaciones.

#### 0.4. Línea base de calidad

- [ ] Ejecutar CI completo en el commit de partida.
- [ ] Registrar duración, fallos y cobertura actuales.
- [ ] Establecer fixtures de usuarios y contenidos de prueba.
- [ ] Definir datos sintéticos reproducibles para pruebas de carga.
- [ ] Definir métricas iniciales para comparar antes y después.

### Entregables

- Inventario funcional y técnico.
- Diagramas C4 de contexto, contenedores y componentes relevantes.
- Matriz de trazabilidad.
- ADR aprobados.
- Línea base de CI, cobertura y rendimiento.

### Pruebas y aceptación

- [ ] La matriz incluye todos los flujos actualmente expuestos.
- [ ] No hay endpoints o RPC críticos sin propietario documentado.
- [ ] Cada dependencia externa tiene timeout, manejo de error y evidencia de configuración.
- [ ] CI completo pasa antes de comenzar la implementación funcional.

**Gate de salida:** arquitectura y alcance aprobados. No se inicia una migración académica estructural sin este gate.

---

## Fase 1 — Currículo, contenido y catálogo académico

### Objetivo

Convertir el conjunto de palabras y preguntas existente en un currículo estructurado, progresivo, versionado y revisable.

### Subfase 1.1. Definición del currículo

- [ ] Definir la ruta general desde Pre-A1/A0 hasta C1 y la extensión C2.
- [ ] Definir la ruta tecnológica y su relación con los niveles generales.
- [ ] Definir cursos, unidades, temas, objetivos y resultados esperados.
- [ ] Definir vocabulario receptivo y productivo por nivel.
- [ ] Definir gramática por nivel y prerequisitos.
- [ ] Definir objetivos de lectura, escritura, comprensión auditiva e interacción.
- [ ] Definir cantidad y dificultad de actividades por objetivo.
- [ ] Definir criterios de desbloqueo, repaso y evaluación de unidad.
- [ ] Evitar saltos de dificultad y repetición innecesaria entre niveles.

### Subfase 1.2. Modelo y migraciones

- [ ] Diseñar entidades académicas y relaciones.
- [ ] Crear migraciones aditivas y compatibles.
- [ ] Versionar cursos y contenido publicado.
- [ ] Agregar estados draft, review, published y archived.
- [ ] Agregar metadatos de nivel, tema, competencia, objetivo y prerequisito.
- [ ] Crear índices según patrones de consulta medidos.
- [ ] Aplicar RLS a datos personales y políticas adecuadas a contenido público.
- [ ] Crear pruebas de migración desde una base vacía y desde la versión actualmente desplegada.

### Subfase 1.3. Gestión y validación de contenido

- [ ] Crear un formato canónico de importación/exportación.
- [ ] Validar estructura, campos requeridos, identificadores, referencias y duplicados.
- [ ] Validar coherencia entre nivel, objetivo, ejercicio y respuesta.
- [ ] Validar traducciones, ejemplos, explicaciones y metadatos.
- [ ] Crear flujo de revisión editorial antes de publicar.
- [ ] Registrar autor, fecha, fuente, revisor y versión.
- [ ] Crear herramientas CLI o scripts reproducibles para importar contenido.
- [ ] Evitar modificar contenido publicado sin generar una nueva versión.

### Subfase 1.4. Curación y expansión del catálogo

- [ ] Auditar el contenido semilla A0 y A1 actual.
- [ ] Detectar traducciones duplicadas, ejemplos antinaturales y categorías inconsistentes.
- [ ] Organizar vocabulario por frecuencia, utilidad, contexto y nivel.
- [ ] Crear listas de expresiones, collocations, phrasal verbs y frases funcionales.
- [ ] Completar contenido general por nivel según el currículo aprobado.
- [ ] Completar el catálogo tecnológico por dominios y niveles.
- [ ] Añadir textos, diálogos y recursos de comprensión con dificultad conocida.
- [ ] Generar fixtures para cada nivel y tipo de ejercicio.
- [ ] No publicar contenido generado por IA sin validación automática y revisión editorial definida.

### Subfase 1.5. APIs y administración

- [ ] Exponer catálogo de cursos, unidades y lecciones.
- [ ] Exponer detalle de lección y objetivos.
- [ ] Exponer prerequisitos y estado de desbloqueo.
- [ ] Exponer contenido paginado y filtrado sin cargar miles de elementos innecesarios.
- [ ] Crear operaciones administrativas protegidas por rol para contenido.
- [ ] Versionar contratos HTTP/gRPC y mantener compatibilidad de clientes actuales.

### Pruebas y aceptación

- [ ] Pruebas de esquema para cada tipo de contenido.
- [ ] Pruebas de importación idempotente.
- [ ] Pruebas de duplicados y referencias inválidas.
- [ ] Pruebas de publicación y versionado.
- [ ] Pruebas de permisos de administrador y estudiante.
- [ ] Pruebas RLS entre usuarios.
- [ ] Pruebas de paginación, filtros y orden.
- [ ] Validación automática del catálogo completo.
- [ ] Ninguna lección publicada carece de objetivo y criterio de finalización.

**Gate de salida:** catálogo académico navegable, versionado, validado y con cobertura de contenido aprobada para la primera versión de producto.

---

## Fase 2 — Motor de lecciones y ejercicios

### Objetivo

Construir un motor reutilizable que permita presentar actividades diferentes bajo un mismo modelo de ejecución, registro y corrección.

### Subfase 2.1. Contrato de actividad

- [ ] Definir un contrato común de actividad: estímulo, instrucciones, opciones, respuesta esperada, pistas y explicación.
- [ ] Definir validación de entrada y salida por tipo de ejercicio.
- [ ] Definir soporte de puntuación parcial donde aplique.
- [ ] Definir retroalimentación inmediata y explicación posterior.
- [ ] Definir límites de tiempo y número de intentos cuando el diseño pedagógico lo requiera.
- [ ] Versionar el formato de actividades.

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

### Pruebas y aceptación

- [ ] Pruebas de selección de preguntas por nivel.
- [ ] Pruebas de cálculo del dominio con escenarios reproducibles.
- [ ] Pruebas de separación de competencias.
- [ ] Pruebas de evidencia insuficiente.
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
