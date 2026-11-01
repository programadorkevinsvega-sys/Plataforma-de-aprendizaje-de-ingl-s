# Inventario funcional — Fase 0.1

## Alcance y criterio de clasificación

Inventario estático del código en `main` (`a905574425b650ac1ebf0ac054a0169ce4f47cab`). La presencia de una página, handler, RPC o tabla no basta para clasificar un caso de uso como completo.

Estados:

- **Parcial:** hay una ruta funcional, pero la experiencia o la persistencia no cumple todavía el objetivo de producto.
- **Implementado en alcance actual:** el flujo tiene código y persistencia para la función limitada que hoy declara.
- **Simulado / hardcodeado:** el resultado se genera con valores fijos o sin persistir la operación declarada.
- **No encontrado:** no existe en el repositorio una implementación suficiente.
- **No verificado:** hay código, pero falta evidencia de funcionamiento real en el entorno desplegado.

## 1. Pantallas de Next.js

| Ruta | Caso de uso observado | Fuente principal | Estado |
|---|---|---|---|
| `/` | Landing y presentación de metodología | `frontend/src/app/page.tsx` | Presentación; incluye una sección demo |
| `/register` | Registro | Auth repository / BFF | Parcial; requiere recorrido E2E y validación operativa |
| `/login` | Login y creación de sesión | Auth repository / BFF | Parcial; requiere recorrido E2E |
| `/dashboard` | Resumen de usuario | `GetDashboardSummaryUseCase` | Parcial; no representa todavía un plan curricular |
| `/learn` | Lista de vocabulario, audio y avance | Content + TTS + progress | Parcial; no hay lecciones/actividades académicas versionadas |
| `/interview` | Pregunta, captura de voz/transcripción y evaluación | Evaluator + WebSocket Transcribe | Parcial; puntuaciones orales no sustentadas por audio |
| `/interview/result` | Presentación del resultado | Parámetros de navegación | Parcial; requiere contrastar persistencia/historial |
| `/interview/drill` | Ejercicio de refuerzo de debilidades | GenerateTargetedDrill | Parcial; handler fija debilidades en pronunciación y fluidez |
| `/srs` | Tarjetas pendientes y repaso | SRS | Parcial; motor SM-2 básico |
| `/srs/session` | Sesión de repaso | SRS | Parcial; validar estados y recuperación E2E |
| `/achievements` | Logros | Gamification | Parcial; consulta datos, pero criterios de dominio académico no están definidos |
| `/leaderboard` | Clasificación | Gamification | Parcial; XP/racha no equivalen a dominio CEFR |
| `/profile` | Consulta/edición de perfil | Auth | Parcial; sin perfil académico completo |
| `/settings` | Actualización de perfil y logout | Auth/session storage | Parcial; preferencias de privacidad y retención no están implementadas |

No se encontró una página dedicada a cursos, unidades, lecciones estructuradas, plan adaptativo ni tutor conversacional.

## 2. Rutas HTTP del BFF

El BFF define 21 rutas versionadas y una ruta de salud. El propietario técnico de la API es el BFF; la ejecución de dominio se delega a los servicios indicados.

| Método y ruta | Handler / propietario de dominio | RPC o comportamiento | Persistencia / estado |
|---|---|---|---|
| POST `/api/v1/auth/register` | `auth_handler` / Auth | Auth.Register | PostgreSQL; parcial, requiere E2E |
| POST `/api/v1/auth/login` | `auth_handler` / Auth | Auth.Login | PostgreSQL; parcial, requiere E2E |
| POST `/api/v1/auth/refresh` | `auth_handler` / Auth | Auth.RefreshToken | Refresh token persistido, rotación/revocación implementadas |
| GET `/api/v1/auth/me` | `auth_handler` / Auth | ValidateToken + GetUserProfile | PostgreSQL; parcial |
| POST `/api/v1/auth/logout` | `user_handler` / Auth | RevokeRefreshToken | Revocación persistida |
| GET `/api/v1/progress/summary` | `user_handler` / Gamification | GetUserStats y consultas derivadas | PostgreSQL; resumen gamificado, no dominio CEFR |
| GET `/api/v1/progress/leaderboard` | `user_handler` / Gamification | GetLeaderboard | PostgreSQL + RLS/permiso de leaderboard |
| GET `/api/v1/progress/achievements` | `user_handler` / Gamification | GetUserAchievements | PostgreSQL; criterios requieren revisión |
| GET `/api/v1/content/vocabulary` | `content_handler` / Content | Auth.GetUserProfile + Content.ListVocabularyWords | PostgreSQL; catálogo real depende de filas importadas |
| GET `/api/v1/content/lessons/today` | `content_handler` / Content | ListVocabularyWords(limit=5) + DTO fijo | Simulado como lección; no hay entidad Lesson |
| POST `/api/v1/content/speech` | `content_handler` / Audio | Audio.SynthesizeAudio | TTS AWS/Cloudflare; límites y timeout visibles |
| POST `/api/v1/content/vocabulary/:id/complete` | `content_handler` | Solo devuelve `completed: true` | Simulado; no persiste finalización |
| GET `/api/v1/srs/due` | `srs_handler` / SRS | SRS.GetDueCards | PostgreSQL; parcial |
| POST `/api/v1/srs/cards/:id/review` | `srs_handler` / SRS | SRS.ReviewCard | PostgreSQL; SM-2 básico |
| POST `/api/v1/progress/learn` | `progress_handler` / SRS + Gamification | SRS.AddCardsToDeck → Gamification.RecordLearningProgress | Secuencia síncrona; riesgo de efecto parcial entre servicios |
| POST `/api/v1/exam/questions/next` | `exam_handler` / Content + Auth | Auth.GetUserProfile + Content.GetRandomInterviewQuestion | PostgreSQL; banco pequeño de preguntas |
| POST `/api/v1/exam/evaluate` | `exam_handler` / AI Evaluator | Auth.GetUserProfile + AI.EvaluateExamAnswer | Bedrock texto→6 métricas; no análisis de audio |
| GET `/api/v1/exam/results/:id/drill` | `exam_handler` / AI Evaluator | AI.GenerateTargetedDrill | Handler fija dos debilidades; el `id` de ruta no se usa para recuperar resultado |
| POST `/api/v1/exam/transcribe/ticket` | `exam_handler` | Emite ticket temporal para WebSocket | Memoria del proceso; no es servicio de conversación |
| GET `/api/v1/exam/transcribe/ws` | `exam_handler` | WebSocket → AWS Transcribe Streaming | Transcripción en vivo; ticket y límites en memoria |
| PATCH `/api/v1/users/me` | `user_handler` / Auth | Auth.UpdateUserProfile | PostgreSQL; perfil básico |
| GET `/health` | BFF | Respuesta constante | Health superficial; no agrega salud/dependencias |

## 3. Contratos Protobuf y consumo desde el BFF

Los seis archivos Protobuf declaran 24 RPC. “Consumido” significa que se encontró una llamada desde los handlers del BFF; no significa que el método se haya verificado en producción.

| Servicio | RPC | Uso desde BFF | Nota |
|---|---|---|---|
| Auth | Register | Sí | Registro |
| Auth | Login | Sí | Login |
| Auth | ValidateToken | Sí | Autenticación de rutas |
| Auth | RefreshToken | Sí | Rotación |
| Auth | RevokeRefreshToken | Sí | Logout |
| Auth | GetUserProfile | Sí | Perfil/autorización/contexto |
| Auth | UpdateUserProfile | Sí | Edición |
| Content | GetVocabularyWord | No encontrado | Posible RPC sin consumidor |
| Content | ListVocabularyWords | Sí | Vocabulario/lección actual |
| Content | GetRandomInterviewQuestion | Sí | Preguntas |
| AI Evaluator | EvaluateExamAnswer | Sí | Evaluación textual |
| AI Evaluator | GenerateTargetedDrill | Sí | Drill |
| Audio | GeneratePhonetics | No encontrado | Los campos actuales vienen de PostgreSQL |
| Audio | SynthesizeAudio | Sí | TTS |
| Audio | TranscribeAudio | No encontrado desde BFF | El flujo activo usa WebSocket directo hacia AWS Transcribe |
| SRS | GetDueCards | Sí | Repaso |
| SRS | ReviewCard | Sí | Repaso |
| SRS | AddCardsToDeck | Sí | Se usa al registrar aprendizaje |
| Gamification | GetUserStats | Sí | Resumen |
| Gamification | AddXp | No encontrado | Posible RPC sin consumidor |
| Gamification | RecordLearningProgress | Sí | Registro idempotente |
| Gamification | InitUserStats | No encontrado | Posible RPC sin consumidor |
| Gamification | GetLeaderboard | Sí | Clasificación |
| Gamification | GetUserAchievements | Sí | Logros |

## 4. Casos de uso y componentes huérfanos o inconsistentes

| Hallazgo | Evidencia | Clasificación |
|---|---|---|
| `markWordCompleted` en frontend y ruta `/:id/complete` | El handler devuelve éxito sin persistencia; la pantalla de aprendizaje usa `recordLearningProgress` | Duplicado/inconsistente; no debe tratarse como progreso persistido |
| `transcribeAudio()` en `BffAIEvaluatorRepository` | Construye POST `/api/v1/exam/transcribe`, ruta que no está registrada en `bff/main.rs` | Contrato frontend huérfano; el flujo activo usa WebSocket |
| `TranscribeAnswerUseCase` en DI | No se encontró invocación en la pantalla activa de entrevista inspeccionada | Posible caso de uso sin consumidor |
| `GetVocabularyWord`, `GeneratePhonetics`, `TranscribeAudio`, `AddXp`, `InitUserStats` | RPC presentes en los contratos, sin invocación desde BFF | Revisar antes de eliminar o versionar |
| Drill por ID | Handler recibe `_result_id` e ignora el identificador; define debilidades fijas | Simulado/parcial |
| Lección del día | ID/título/description codificados en handler | Simulado como entidad académica |
| Landing demo | Comentario de Interactive Demo Preview | Distinguir demostración de flujo de aprendizaje real |
| Log de inicio gamification | Crea un usuario UUID aleatorio solo para mostrar estadísticas demo | Salida de consola de demostración; no representa datos persistidos |

## 5. Tablas y persistencia observadas

Las nueve migraciones crean o modifican diez tablas de aplicación:

| Tabla | Propietario funcional | Evidencia de migración | Uso encontrado |
|---|---|---|---|
| `users` | Auth | `20260805000000_init_schema.sql` | Registro, perfil, nivel de destino |
| `vocabulary_words` | Content | `20260805000000_init_schema.sql` | Catálogo consultado por servicio |
| `context_sentences` | Content | `20260805000000_init_schema.sql` | Frases contextuales |
| `user_srs_progress` | SRS | Inicial + RLS | Estado/fecha de repaso |
| `ai_exam_sessions` | Evaluación | Inicial + RLS | Tabla creada; persistencia del resultado actual no demostrada en handler |
| `user_stats` | Gamification | Inicial + RLS | XP, monedas, racha y palabras |
| `interview_questions` | Content | `20260806000000...` | Banco de preguntas |
| `achievements` | Gamification | `20260806000000...` | Catálogo de logros |
| `auth_refresh_tokens` | Auth | `20261028000001...` | Hash, expiración, revocación |
| `learning_progress_events` | Gamification | `20261028000002...` | Ledger idempotente por usuario/palabra |

No se encontraron tablas para cursos/versiones, unidades, lecciones académicas, objetivos, actividades, intentos, dominio por competencia ni conversaciones/turnos.

RLS habilitado y forzado en: `user_srs_progress`, `ai_exam_sessions`, `user_stats` y `learning_progress_events`. Existe además una política de lectura de leaderboard en `user_stats`. No generalizar esta cobertura a las diez tablas: `auth_refresh_tokens` no tiene política RLS en las migraciones inspeccionadas.

## 6. Flujo real de aprendizaje y límites actuales

El endpoint `/api/v1/progress/learn` realiza dos llamadas secuenciales: primero añade tarjeta al SRS y después registra XP/monedas/palabra aprendida. Si la primera confirma y la segunda falla, puede quedar un efecto parcial. El servicio de gamificación protege su ledger con clave única `(user_id, word_id)` y transacción; eso hace idempotente esa parte, pero no crea atomicidad distribuida con SRS.

El endpoint `/api/v1/content/lessons/today` no registra objetivos, actividades o intentos. El flujo actual de aprendizaje se entiende como vocabulario + TTS + registro de progreso, no como un motor de lecciones.

## 7. Flujos de producto no encontrados

- Tutor conversacional multi-turno, escenarios y resumen de conversación.
- Diagnóstico inicial estructurado y plan de aprendizaje adaptativo.
- Cursos, versiones publicadas, unidades, objetivos y prerrequisitos.
- Motor genérico de actividades y persistencia de intentos.
- Dominio académico por competencia/objetivo separado de XP.
- Listening con audio como estímulo y sin transcripción visible antes de responder.
- Modalidades de evaluación escrita y hablada con rúbricas independientes.
- Preferencias/consentimiento y eliminación de conversaciones.

Estos puntos son alcance objetivo del roadmap, no defectos de endpoints que existan hoy.
