# DOCUMENTO MAESTRO DE ARQUITECTURA — DEVFLUENCY

> **Versión sincronizada:** 2026-11-01.
> **Estado:** especificación de arquitectura actual y arquitectura objetivo.
> **Roadmap rector:** [docs/roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md](docs/roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md).
> **Vista ejecutiva e histórica:** [ROADMAP_ARQUITECTURA_ENTERPRISE.md](ROADMAP_ARQUITECTURA_ENTERPRISE.md).
> **Regla:** este documento describe cómo está construido el sistema, qué puede afirmarse con evidencia y cómo debe evolucionar. No sustituye los checklists ni los gates del roadmap rector.

---

## 0. Cómo leer esta especificación

Para evitar confundir código existente con objetivos futuros, cada capacidad se describe desde dos perspectivas:

- **Implementación actual:** lo que se observa en el código, las migraciones, las interfaces y la configuración del repositorio.
- **Arquitectura objetivo:** lo que se debe construir o completar de acuerdo con el roadmap rector.

Los estados usados son:

| Estado | Significado |
|---|---|
| Implementado | Existe código funcional y la evidencia de pruebas cubre el comportamiento descrito |
| Implementado parcialmente | Existe una parte del flujo, pero faltan capacidades, integración, validación o pruebas |
| Pendiente | El comportamiento está definido como objetivo, pero no se encontró una implementación suficiente |
| No verificado | Hay configuración o código, pero no existe evidencia suficiente de su operación en un entorno representativo |

La presencia de un crate, una ruta, una tabla, un proto, una dependencia o una pantalla no demuestra por sí sola que el caso de uso esté terminado.

## 1. Visión del producto

DevFluency es una plataforma de aprendizaje de inglés general y profesional, con una ruta especializada en tecnología y desarrollo de software.

La experiencia debe permitir que el estudiante:

1. Comience desde Pre-A1/A0 y avance mediante objetivos compatibles con el MCER/CEFR hasta C1, con una extensión C2 definida y validada.
2. Aprenda inglés general y desarrolle en paralelo el inglés necesario para el trabajo y la tecnología.
3. Relacione el inglés escrito con el sonido mediante el Sistema Dual de Pronunciación para Hispanohablantes.
4. Practique vocabulario, gramática, lectura, escritura, comprensión auditiva, expresión oral e interacción.
5. Reciba feedback claro y proporcional a su nivel.
6. Repase contenidos mediante repetición espaciada.
7. Practique con un tutor conversacional de IA y escenarios reales.
8. Reciba evaluaciones sustentadas en la evidencia que realmente corresponde a cada competencia.
9. Conozca su dominio académico por objetivo y competencia.
10. Mantenga la motivación con XP, monedas, rachas y logros sin confundir esas recompensas con su nivel de inglés.

La plataforma no debe presentarse como certificadora oficial del CEFR salvo que exista un proceso externo de acreditación que lo respalde.

### 1.1. Filosofía pedagógica

La secuencia escuchar → repetir → asociar → hablar → comprender → estudiar gramática puede utilizarse como principio de diseño para favorecer el uso contextual y la práctica activa.

No debe convertirse en una regla rígida que impida enseñar gramática cuando sea útil. La gramática, las explicaciones, la traducción y las guías fonéticas deben apoyar la adquisición y no reemplazar la comprensión y producción del idioma.

### 1.2. Rutas de aprendizaje

**Inglés general:** situaciones cotidianas, presentaciones, viajes, relaciones sociales, servicios, opiniones y comunicación progresivamente más compleja.

**Inglés profesional y tecnológico:** reuniones, comunicación asíncrona, entrevistas, code review, arquitectura, bases de datos, redes, cloud, DevOps, CI/CD, seguridad, documentación, incidencias y explicación de decisiones técnicas.

Las dos rutas deben compartir fundamentos lingüísticos y evitar que el vocabulario tecnológico reemplace la formación general.

## 2. Sistema Dual de Pronunciación para Hispanohablantes

### 2.1. Objetivo pedagógico

El Sistema Dual es una herramienta de enseñanza para ayudar al estudiante hispanohablante a relacionar una palabra o frase en inglés con una guía escrita legible y dos experiencias de escucha. Su intención es facilitar el reconocimiento de sonidos, la repetición, la familiarización con el ritmo del inglés y la confianza al hablar.

**No es un mecanismo de evaluación.** Que el estudiante escuche una pronunciación modelo o lea una guía no demuestra que él mismo pronuncie correctamente.

### 2.2. Experiencia funcional esperada

Para cada palabra, expresión o frase que lo requiera, la interfaz debe presentar:

1. **Texto original en inglés:** conserva la escritura correcta de la palabra o frase.
2. **Pronunciación lenta:** guía aproximada para hispanohablantes y control «Escuchar lentamente». El audio debe ayudar a identificar sonidos y practicar partes de la expresión.
3. **Pronunciación natural:** guía aproximada para hispanohablantes y control «Escuchar a velocidad natural». El audio debe familiarizar con ritmo, énfasis, acento y unión natural de sonidos.
4. **Práctica repetida:** escuchar lento → repetir en voz alta → escuchar natural → repetir nuevamente.

La guía escrita es una aproximación didáctica. No es una traducción, no reemplaza la ortografía inglesa y no debe presentarse como transcripción IPA/AFI exacta.

### 2.3. Calidad lingüística

- No convertir automáticamente cualquier secuencia de letras inglesas en sonidos españoles mediante sustituciones simplistas.
- No enseñar equivalencias incorrectas para fonemas que no existen en español. Por ejemplo, el sonido /ð/ de *mother* no es idéntico a la «d» española.
- Revisar las guías para que correspondan a la palabra y al acento de referencia.
- Mantener coherencia entre texto original, guía lenta, guía natural y audio.
- Las dos guías pueden coincidir cuando una diferencia no aporte valor, pero no deben inventarse cambios solo para que los campos sean distintos.
- El audio lento debe ser inteligible y no alterar la identidad de fonemas.
- El audio natural debe representar un ritmo conversacional real del acento seleccionado.
- Ofrecer notas breves para sonidos difíciles cuando sea útil; evitar saturar al estudiante.
- No almacenar grabaciones de práctica del usuario por defecto. La captura de voz para evaluación requiere consentimiento, retención y eliminación definidos.

### 2.4. Implementación actual y brechas

**Existe actualmente:**

- La pantalla de aprendizaje en **frontend/src/app/learn/page.tsx** muestra la sección «Sistema Dual de Pronunciación para Hispanohablantes».
- El componente muestra una guía lenta y otra natural, con controles separados.
- La reproducción lenta usa TTS con la velocidad x-slow; la natural utiliza velocidad normal.
- Las semillas A0/A1 contienen los campos spanish_phonetic y spanish_phonetic_natural para palabras y frases.
- El servicio de contenido devuelve ambas representaciones cuando están presentes.
- El TTS permite seleccionar AWS Polly o Cloudflare Workers AI mediante TTS_PROVIDER.

**Todavía requiere completar:**

- El método GeneratePhonetics actual llama dos veces a la misma transliteración, por lo que devuelve el mismo resultado en slow_phonetic y natural_phonetic.
- El motor fonético es un diccionario limitado con transformaciones de respaldo; no garantiza una pronunciación exacta para vocabulario arbitrario.
- Los campos natural/lento de las semillas requieren auditoría editorial y fonética, no asumir que siempre representan dos realizaciones correctas.
- Deben añadirse pruebas del ciclo completo de aprendizaje, accesibilidad, reproducción, errores y correspondencia entre guía y audio.
- El Sistema Dual debe integrarse en todos los contextos pedagógicos acordados, sin duplicar recursos ni crear un microservicio innecesario.

La implementación y sus criterios de aceptación corresponden a Fase 1, Fase 2 y Fase 8 del roadmap rector.

## 3. Currículo y contenido académico

### 3.1. Alcance curricular objetivo

La ruta general debe abarcar Pre-A1/A0, A1, A2, B1, B2, C1 y una extensión C2. Cada nivel necesita objetivos observables, prerrequisitos, vocabulario, gramática, situaciones, competencias y criterios de avance.

La ruta profesional/tecnológica debe vincularse con niveles generales y cubrir, como mínimo:

- Comunicación profesional y presentaciones.
- Reuniones, stand-ups y comunicación asíncrona.
- Code review y pull requests.
- Entrevistas conductuales y técnicas.
- Arquitectura, microservicios, bases de datos y redes.
- Cloud, DevOps, CI/CD, observabilidad y seguridad.
- Documentación técnica, incidencias y comunicación con clientes.

El nivel del estudiante debe estimarse mediante evidencias académicas, no por XP.

### 3.2. Implementación actual

- Existe un servicio de contenido/vocabulario con datos semilla.
- Las semillas revisadas contienen 322 entradas A0 y 469 entradas A1.
- Los registros incluyen palabra, categoría, nivel, traducción, guía fonética y frases contextualizadas.
- Las frases incluyen texto en inglés, guía fonética, traducción y campo de pronunciación natural.
- El contenido actual es una base inicial. No equivale al catálogo completo de 5.000–8.000 términos ni al currículo A0–C2.

### 3.3. Arquitectura objetivo del contenido

El modelo conceptual debe incluir, según normalización y necesidades reales:

- Course y CourseVersion.
- CEFRLevel.
- Unit y Lesson.
- LearningObjective.
- Skill.
- Activity y ExerciseItem.
- ContentAsset.
- Prerequisite.
- ContentReview.
- Versiones publicadas inmutables para que los resultados históricos no cambien silenciosamente.

El administrador de contenido debe contar con validación, revisión editorial, publicación y trazabilidad. El contenido generado por IA no se publica sin validación estructural, lingüística y editorial.

La definición detallada de entidades, migraciones, APIs, importación y criterios está en Fase 1 del roadmap rector.

## 4. Lecciones, ejercicios y feedback

### 4.1. Capacidades existentes

El frontend incluye una pantalla de aprendizaje de vocabulario contextual, navegación entre palabras y frases, reproducción TTS y registro de progreso. También existen flujos de entrevista, transcripción, drills y repetición espaciada.

Estas capacidades son una base funcional, pero no equivalen a un motor genérico de lecciones que soporte todas las familias de actividades previstas.

### 4.2. Motor objetivo

El motor reutilizable debe tener un contrato versionado para estímulo, instrucciones, opciones, respuesta, pistas, explicación y corrección.

El alcance incluye, entre otros:

- Selección múltiple y traducción en ambas direcciones.
- Completar espacios y ordenar palabras.
- Relacionar palabra, significado, contexto o expresión.
- Audio con preguntas de comprensión.
- Dictado y comparación de texto.
- Lectura con preguntas.
- Transformación gramatical y corrección de errores.
- Respuesta escrita abierta con rúbrica.
- Diálogo guiado y recuperación activa de vocabulario.

Las respuestas cerradas deben calificarse con reglas deterministas. Las respuestas abiertas pueden utilizar rúbricas y modelos de IA controlados. Las sesiones necesitan persistencia, recuperación, idempotencia y feedback ajustado al nivel.

El Sistema Dual de Pronunciación se integra como apoyo transversal al contenido; no se convierte en un ejercicio que otorgue una nota de pronunciación.

## 5. Arquitectura de aplicación actualmente presente

### 5.1. Vista de alto nivel

El repositorio utiliza:

- Frontend web Next.js/React.
- BFF HTTP con Axum.
- Microservicios Rust que exponen contratos gRPC mediante Tonic/Protobuf.
- PostgreSQL como almacenamiento principal.
- Un servicio de audio/fonética para transliteración, TTS y STT.
- Servicios de autenticación, contenido, evaluación, SRS y gamificación.

El workspace contiene estos crates principales:

| Componente | Responsabilidad actual |
|---|---|
| bff | API HTTP para frontend, WebSockets de transcripción y clientes gRPC |
| auth-identity-service | Registro, login, JWT, perfil y gestión de refresh tokens |
| content-vocabulary-service | Consultas de vocabulario, frases y preguntas de entrevista |
| phonetic-audio-service | Guía fonética, síntesis TTS y transcripción STT |
| ai-evaluator-service | Evaluación textual de respuestas y generación de drills |
| srs-engine-service | Cálculo SM-2 y persistencia de revisiones |
| gamification-progress-service | Estadísticas, XP, monedas, progreso y leaderboard |
| common | Tipos compartidos, autenticación, errores y contexto RLS |
| proto | Contratos Protobuf/gRPC |

La existencia de estos componentes no garantiza que todos los casos de uso previstos estén completos o que todos los servicios utilicen las dependencias de infraestructura declaradas.

### 5.2. Organización interna

La arquitectura objetivo sigue principios DDD y separación de responsabilidades entre dominio, aplicación, infraestructura y presentación. El código actual está organizado de manera más sencilla, con módulos como domain, service, main y adaptadores específicos; no afirmar que todos los servicios implementan una Clean Architecture completa hasta verificarlo.

Se deben preservar los límites de dominio y evitar añadir microservicios solo por separar carpetas. Un servicio nuevo requiere un ADR que justifique escalado, ciclo de despliegue, seguridad, disponibilidad o propiedad de datos.

### 5.3. Contratos y comunicación

- El frontend consume HTTP a través del BFF.
- El BFF utiliza clientes gRPC generados desde Protobuf.
- Los contratos actuales cubren auth, content, evaluación IA, audio, SRS y gamificación.
- Los contratos deben evolucionar de manera compatible y con pruebas de contrato.
- No se debe exponer el SDK de un proveedor en el dominio ni devolver errores crudos de infraestructura al navegador.

## 6. Evaluación académica: evidencia actual y arquitectura objetivo

### 6.1. Implementación actual

El servicio ai-evaluator-service integra AWS Bedrock y contiene una matriz de seis puntuaciones:

| Métrica actual | Peso actual en el código |
|---|---:|
| Listening | 20 % |
| Pronunciación | 20 % |
| Fluidez | 20 % |
| Vocabulario | 15 % |
| Conversación | 15 % |
| Gramática | 10 % |

El código calcula un total ponderado, aplica un umbral de aprobación de 90 y selecciona las dos puntuaciones más bajas para recomendar refuerzo. Estos pesos y el umbral describen el comportamiento actual del código; no deben presentarse como una rúbrica académica calibrada ni como criterio oficial de nivel CEFR.

El BFF recibe una respuesta textual. Aunque el cuerpo tiene un campo audio_base64, el validador actual rechaza valores de audio no vacíos. La grabación se procesa por separado mediante WebSocket y AWS Transcribe; al evaluador se envía el texto.

La interfaz de entrevista muestra la pregunta escrita, permite escucharla por TTS y admite respuesta hablada o escrita. El resultado de la grabación se convierte en transcripción y la evaluación posterior utiliza la respuesta textual.

El evaluador actual recibe target_level, pero el parámetro no se utiliza en el cálculo/prompt efectivo. El prompt de Bedrock infiere listening, pronunciación y fluidez desde el texto. Por tanto:

- Una transcripción no demuestra cómo se pronunciaron los fonemas.
- El texto no contiene pausas, ritmo ni continuidad acústica.
- Una respuesta relevante a una pregunta visible no demuestra que el estudiante comprendió un audio.
- La modalidad escrita no debe producir puntuaciones de pronunciación o fluidez oral.
- El resultado actual de seis métricas no debe tratarse como una evaluación válida de todas esas competencias.

### 6.2. Modalidad escrita objetivo

La modalidad escrita utiliza como evidencia el texto del estudiante y evalúa dimensiones justificadas por texto, según la consigna y el nivel:

- Cumplimiento de la tarea y adecuación comunicativa.
- Gramática y construcción de oraciones.
- Vocabulario y precisión léxica.
- Cohesión, coherencia y claridad.

No asigna notas de pronunciación ni de fluidez oral. Las métricas no medidas se representan como not_measured o not_applicable; nunca como cero por defecto.

### 6.3. Modalidad hablada objetivo

La modalidad hablada utiliza la grabación real y su transcripción:

- Pronunciación se evalúa a partir de la evidencia acústica.
- Fluidez oral requiere señales del audio, como continuidad, ritmo y pausas.
- Transcripción apoya la evaluación de contenido, vocabulario, gramática y cumplimiento de la consigna.
- Audio ausente, corrupto, insuficiente o de baja calidad impide puntuar las métricas afectadas.
- La salida de STT por sí sola no confirma ni descarta una pronunciación correcta.

Las rúbricas y los resultados de escrito y hablado deben mantenerse separados. Solo pueden compararse dimensiones comunes cuando exista calibración válida.

### 6.4. Comprensión auditiva

Listening requiere actividades específicas cuyo estímulo principal sea un audio y cuyas respuestas demuestren comprensión. No debe revelarse la transcripción antes de responder. La visibilidad del texto de la pregunta debe tenerse en cuenta para no confundir lectura con escucha.

### 6.5. Separación enseñanza/evaluación

El Sistema Dual presenta modelos de pronunciación para que el estudiante practique. La evaluación hablada analiza la voz producida por el estudiante. Nunca se usa el audio modelo de TTS como evidencia de su pronunciación.

Los requisitos de modalidad, rúbricas, evidencia, privacidad, pruebas y criterios están en Fase 3 del roadmap rector.

## 7. Tutor conversacional y proveedores de IA

### 7.1. Separación de capacidades

DevFluency debe distinguir estas capacidades:

| Capacidad | Función | Estado |
|---|---|---|
| Evaluador de entrevistas | Analizar respuestas y devolver feedback | Implementado parcialmente; actualmente basado en texto y Bedrock |
| Tutor conversacional | Mantener conversaciones guiadas/libres, usar escenarios, corregir, resumir y adaptar el lenguaje al estudiante | Pendiente según Fase 5 |
| TTS | Generar audio de preguntas, frases y modelos de pronunciación | Implementado con selector AWS/Cloudflare |
| STT | Transcribir la voz del estudiante | Implementado con AWS Transcribe |

Un evaluador que procesa una respuesta no equivale a un tutor conversacional con conversaciones, turnos, memoria controlada y escenarios.

### 7.2. Proveedor conversacional objetivo

El tutor debe seleccionar el proveedor mediante una variable independiente:

- CONVERSATIONAL_AI_PROVIDER=cloudflare
- CONVERSATIONAL_AI_PROVIDER=aws

Los dos adaptadores deben implementar el mismo contrato interno, validar su configuración, normalizar errores, limitar consumo y pasar la misma suite de contrato.

**Esta selección no depende de TTS_PROVIDER.** La elección del proveedor de voz y del proveedor de conversación debe poder ser diferente.

### 7.3. Privacidad y límites

El tutor debe persistir conversaciones y turnos con aislamiento por usuario, guardar solo el historial necesario, limitar el contexto enviado al proveedor, permitir eliminación y aplicar retención documentada. El modelo no puede modificar directamente roles, XP, monedas, nivel académico ni estado de curso.

El selector y los adaptadores conversacionales están definidos como objetivo en Fase 5 del roadmap rector; no se deben documentar como implementados solo porque existe Bedrock en el evaluador actual.

## 8. Arquitectura de voz: TTS y STT

### 8.1. TTS actual

El servicio phonetic-audio-service implementa un contrato TTS y carga un proveedor al iniciar mediante TTS_PROVIDER.

Proveedores actuales:

- AWS Polly.
- Cloudflare Workers AI/Aura-2.

El selector admite aws o cloudflare. La configuración inválida impide iniciar y no existe fallback automático. El proveedor se configura en el proceso de audio. La documentación operativa complementaria está en **docs/tts-providers.md**.

La velocidad depende del proveedor: Polly puede generar audio con prosody/SSML; Cloudflare utiliza factores de reproducción de la aplicación cuando el modelo no admite el mismo control nativo. No describir ambos mecanismos como equivalentes internamente.

### 8.2. STT actual

La transcripción utiliza AWS Transcribe Streaming con idioma configurable, por defecto en-US. El flujo actual envía audio PCM por WebSocket desde el navegador al BFF y el servicio de audio obtiene texto.

STT es una conversión de voz a texto, no una evaluación acústica de pronunciación. La modalidad hablada objetivo debe preservar y procesar la grabación que necesita el evaluador, con consentimiento, límites y política de retención.

### 8.3. Relación con el Sistema Dual

El Sistema Dual puede solicitar TTS lento y TTS natural a partir de guías revisadas. No debe asumir que cambiar playback rate transforma una transcripción fonética deficiente en una guía correcta. La calidad lingüística de las guías y la calidad del audio requieren validación separada.

## 9. Persistencia y modelo de dominio

### 9.1. Esquema actualmente presente

Las migraciones SQL son la fuente de verdad del esquema real. Entre las entidades/tablas actuales se encuentran:

- users.
- vocabulary_words.
- context_sentences.
- user_srs_progress.
- ai_exam_sessions.
- user_stats.
- interview_questions.
- achievements.
- auth_refresh_tokens.
- learning_progress_events.

La lista y las columnas reales deben confirmarse en las migraciones antes de diseñar consultas, relaciones o nuevas migraciones. Los ejemplos DDL históricos de este documento no son contratos ejecutables.

### 9.2. Modelo académico objetivo

El roadmap rector define los conceptos que deben incorporarse de forma incremental:

- Curso, versión de curso, nivel CEFR, unidad y lección.
- Objetivo de aprendizaje, competencia y actividad.
- Intento de ejercicio y evidencia.
- Dominio del estudiante por objetivo/competencia.
- Plan de aprendizaje y recomendaciones.
- Tarjetas y revisiones SRS.
- Conversación, turnos, escenarios y uso de proveedor IA.

Estos conceptos no implican crear una tabla por cada nombre. La normalización, los índices, los límites de dominio y los patrones de consulta deben justificarse en el diseño de cada fase.

### 9.3. Consistencia

- Las mutaciones académicas y recompensas relacionadas deben ser transaccionales o idempotentes.
- El ledger learning_progress_events utiliza una clave por usuario y palabra para impedir duplicar recompensas ante reintentos.
- El contenido publicado necesita versionado para no alterar resultados históricos.
- Las fechas de actividad y rachas deben considerar la zona horaria del usuario.
- Los cambios de esquema deben ser aditivos y compatibles con despliegues graduales siempre que sea posible.

## 10. Seguridad y aislamiento

### 10.1. Autenticación actual

- Las contraseñas se procesan con Argon2id.
- El servicio JWT usa JWT_SECRET obligatorio, con un mínimo de 32 bytes.
- El código actual crea JWT con el encabezado predeterminado de jsonwebtoken y una clave simétrica obtenida del secreto. No describir el mecanismo actual como JWT Ed25519.
- Los refresh tokens se generan como valores opacos, se persiste su hash SHA-256, tienen TTL de 30 días y el servicio implementa rotación y revocación.
- Las consultas de perfil requieren bearer token y vinculan el user_id solicitado con el sujeto autenticado.

Los contratos y pruebas deben seguir validando expiración, rotación, reutilización, revocación, CSRF cuando corresponda y fallos parciales.

### 10.2. RLS actual

Las migraciones habilitan políticas sobre user_srs_progress, ai_exam_sessions y user_stats. Una migración posterior fuerza RLS en esas tres tablas y añade un ámbito explícito para lectura de leaderboard. learning_progress_events también habilita y fuerza RLS con política por usuario.

No afirmar que todas las tablas sensibles tienen RLS ni que el aislamiento total está cerrado. Debe mantenerse una matriz de tablas, roles, políticas y operaciones; incluir pruebas negativas entre usuarios y comprobar el contexto RLS dentro de transacciones.

### 10.3. Otras capas

- Validar entradas, tamaño de payload y permisos en backend.
- Aplicar rate limits por usuario y operación.
- Mantener listeners loopback por defecto salvo exposición explícita y protegida.
- Configurar CORS con orígenes exactos por ambiente.
- Usar IAM roles de mínimo privilegio para AWS y tokens mínimos para Cloudflare.
- No registrar tokens, secretos, audio Base64, texto completo de conversaciones ni datos personales innecesarios.
- Definir retención y eliminación de grabaciones y conversaciones.
- Probar autorización en cada RPC, no solo en la UI.

La auditoría inicial de seguridad es una fotografía estática de su fecha de inspección; los hallazgos deben volver a verificarse contra main y no copiarse como estado actual sin comprobar su resolución.

## 11. Redis, NATS y mensajería

El repositorio contiene configuración de Redis y NATS en docker-compose.yml y variables de ejemplo. El workspace también declara dependencias relacionadas. Sin embargo, la presencia de la infraestructura no demuestra una integración de extremo a extremo.

- La ruta de progreso/gamificación revisada utiliza PostgreSQL y transacciones para actualizar user_stats y registrar learning_progress_events.
- fred figura como dependencia de gamification-progress-service, pero no se debe afirmar que su flujo operativo ya depende de Redis sin identificar el código de conexión y sus pruebas.
- async-nats figura en las dependencias del workspace y NATS en Compose/configuración, pero no se acreditó un flujo de productores/consumidores activo en los servicios revisados.
- NATS JetStream y Redis pueden formar parte de la arquitectura futura cuando exista un caso de uso real, contratos, garantías de entrega, idempotencia, observabilidad y pruebas de recuperación.

No documentar un «Redis Cluster» ni un bus JetStream operativo como si estuvieran implementados si no existe evidencia concreta.

## 12. CI/CD y topología de despliegue

### 12.1. CI actual

El workflow de CI clasifica cambios y ejecuta las validaciones relevantes según las rutas afectadas. Incluye jobs para Rust, frontend, auditorías de dependencias, scripts y Markdown. Los cambios exclusivos de documentación no deben compilar ni desplegar las aplicaciones.

El estado de un workflow debe verificarse en GitHub para el commit/PR concreto. La existencia del YAML no acredita que todas las suites estén aprobadas ni que exista una suite E2E completa.

### 12.2. CD actual

El workflow **Deploy Ubuntu (systemd)**:

- Espera CI exitoso en main y comprueba que el cambio requiere despliegue.
- Compila los binarios de los servicios Rust en CI.
- Construye el frontend Next.js standalone.
- Empaqueta binarios, frontend, scripts y migraciones.
- Ejecuta migraciones SQLx de forma controlada.
- Instala releases inmutables y gestiona el enlace current.
- Usa servicios systemd y health checks.
- Conserva un release previo para facilitar rollback.

El despliegue de las aplicaciones no requiere instalar Docker en las VMs. Docker Compose queda como opción de entorno local/desarrollo para dependencias, no como mecanismo de despliegue productivo de los binarios.

### 12.3. Topología y operación

La infraestructura de aplicación se ejecuta en Ubuntu y usa configuración externa en /etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env. Los servicios systemd cargan ese archivo.

La topología operativa definida para el proyecto separa proxy/ingress, aplicaciones y dependencias de datos. Los detalles de VPC, Security Groups, Tailscale, Cloudflare Tunnel y nginx deben mantenerse en documentación de infraestructura/operación y verificarse contra la configuración viva. Este documento no debe inventar direcciones IP, secretos o reglas de firewall.

Kubernetes/Docker Swarm no son requisitos aprobados del despliegue actual. Cualquier adopción futura requiere un ADR y análisis de coste/operación.

## 13. Estado de la arquitectura frente al roadmap rector

| Fase | Área | Implementación observada | Brecha principal |
|---|---|---|---|
| 0 | Descubrimiento y decisiones | Auditoría estática inicial e inventario parcial | Matriz integral, ADR, baseline verificable y riesgos actuales |
| 1 | Currículo y contenido | Semillas A0/A1 y servicio de vocabulario | Currículo CEFR completo, ampliación, validación, versionado y administración |
| 2 | Lecciones y ejercicios | Aprendizaje de vocabulario, entrevista, TTS y Sistema Dual visible | Motor genérico de actividades; guías/audio lento-natural confiables y tests del ciclo |
| 3 | Diagnóstico y evaluación | Evaluador Bedrock textual con seis puntuaciones | Modalidades separadas, análisis del audio real, rúbricas, listening específico y dominio académico |
| 4 | SRS | SM-2 y revisiones | Integración curricular y medición de retención |
| 5 | Tutor conversacional | Bedrock en evaluador de entrevistas | Tutor con sesiones, turnos, escenarios, privacidad y adaptadores Cloudflare/AWS |
| 6 | Personalización | Perfil, progreso y dashboard | Recomendador/plan diario basado en dominio y disponibilidad |
| 7 | Gamificación | XP, monedas, racha y progreso idempotente básico | Economía completa, misiones, logros calibrados y separación del dominio académico |
| 8 | UX | Rutas principales de Next.js | UX completa, responsive, accesibilidad y estados E2E |
| 9 | Operación | CI, release package, systemd, TTS configurable y parte de RLS | Observabilidad completa, seguridad integral, backups, restauración, carga y rollback probado |
| 10 | Lanzamiento | No acreditado | Recorridos E2E, piloto, regresión y aceptación global |

Los estados de esta tabla son orientativos y deben actualizarse solo con evidencias nuevas. La tabla de tareas y los gates vigentes permanecen en el roadmap rector.

## 14. Reglas de evolución

1. No cambiar un contrato HTTP/gRPC sin analizar compatibilidad y pruebas.
2. No crear un nuevo microservicio si un módulo interno mantiene un límite claro.
3. No añadir tablas sin revisar el modelo de dominio y los patrones de consulta.
4. No usar XP como sustituto de dominio académico.
5. No calificar una competencia con evidencia que no la mide.
6. No confundir guía de pronunciación modelo con pronunciación producida por el estudiante.
7. No usar la transcripción STT como sustituto del audio para evaluar pronunciación o fluidez.
8. No acoplar el proveedor conversacional, TTS y STT.
9. No introducir fallbacks silenciosos entre proveedores.
10. No desplegar código que no haya pasado CI ni cambios de documentación como releases de aplicación.
11. No considerar una fase terminada sin pruebas, seguridad, persistencia, observabilidad, documentación y evidencia de aceptación.

## 15. Referencias de implementación y documentación

- [Roadmap maestro de implementación](docs/roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
- [Roadmap original sincronizado](ROADMAP_ARQUITECTURA_ENTERPRISE.md)
- [Documentación de TTS](docs/tts-providers.md)
- [Auditoría inicial de seguridad](docs/audits/2026-10-28-initial-security-audit.md)
- [Excepciones de dependencias](docs/audits/2026-10-29-dependency-exceptions.md)
- Migraciones de base de datos: carpeta migrations.
- Contratos gRPC: carpeta proto y crate crates/proto.
- Código de servicios: carpeta crates.
- Aplicación web: carpeta frontend.
- Workflows CI/CD: carpeta .github/workflows.
- Despliegue Ubuntu/systemd: carpeta deploy.

**Regla final:** este documento describe la arquitectura presente y la evolución aprobada. Toda tarea nueva, criterio de aceptación y declaración de fase terminada debe seguir el roadmap rector.
