# Matriz de trazabilidad — Fase 0.1

## Convenciones

- **Parcial:** hay un flujo o persistencia limitada, pero no cumple la necesidad completa.
- **No implementado:** no hay una ruta/modelo suficiente en el repositorio actual.
- **Simulado:** devuelve un resultado codificado o no persiste la operación.
- **No verificado:** requiere evidencia de ejecución o pruebas.
- Los números de migración se refieren a archivos bajo `migrations/`.

## Registro → login → perfil

| Requisito/caso de uso | Frontend | HTTP BFF | RPC / propietario | Persistencia | Prueba/evidencia | Estado |
|---|---|---|---|---|---|---|
| Crear cuenta | `/register`, RegisterUserUseCase | POST `/api/v1/auth/register` | Auth.Register | `users`, `user_stats`, `auth_refresh_tokens`; migraciones 1 y 8 | Tests auth/registro; falta E2E | Parcial |
| Iniciar sesión | `/login`, LoginUserUseCase | POST `/api/v1/auth/login` | Auth.Login | `users`, `auth_refresh_tokens` | Tests auth; falta E2E | Parcial |
| Mantener sesión | SessionStorage/BffHttpClient | POST refresh, GET me | Auth.RefreshToken, ValidateToken, GetUserProfile | `auth_refresh_tokens`, `users` | Rotación/replay/revocación cubiertos en test de integración | Implementado en alcance de sesión; falta E2E |
| Cerrar sesión | `/settings`, LogoutUserUseCase | POST logout | Auth.RevokeRefreshToken | `auth_refresh_tokens` | Revocación presente; falta prueba UI E2E | Parcial |
| Actualizar perfil | `/profile`, `/settings` | PATCH `/api/v1/users/me` | Auth.UpdateUserProfile | `users` | Sin matriz de campos/roles completa | Parcial |

## Catálogo → aprendizaje → progreso

| Requisito/caso de uso | Frontend | HTTP BFF | RPC / propietario | Persistencia | Prueba/evidencia | Estado |
|---|---|---|---|---|---|---|
| Listar vocabulario | `/learn`, GetVocabularyListUseCase | GET `/api/v1/content/vocabulary` | Auth.GetUserProfile → Content.ListVocabularyWords | `vocabulary_words`, `context_sentences` | SQL queries; cobertura de integración no demostrada | Parcial |
| Cargar contenido A0/A1 | `/learn` | misma ruta | Content consulta PostgreSQL | Migración semilla SQL crea seis palabras; JSON tiene 791 registros preparados | No se encontró loader de JSON en el servicio ni en paquete de release | Bloqueo de datos |
| Ver lección del día | `/learn` | GET `/api/v1/content/lessons/today` | Content.ListVocabularyWords | Reutiliza vocabulario; sin entidad Lesson | Handler genera id/título/descripción constantes | Simulado como lección |
| Practicar guía dual | `/learn` | campos devueltos con vocabulario | Los campos de guía se leen de Postgres; GeneratePhonetics no se consume desde BFF | `vocabulary_words`, `context_sentences` | transliteration tiene 2 unit tests; generador llama dos veces a la misma función | Parcial |
| Escuchar TTS | `/learn`, SynthesizeSpeechUseCase | POST `/api/v1/content/speech` | Audio.SynthesizeAudio | Proveedor externo; sin persistencia de audio en DB | 17 tests en `tts.rs`; timeout/error mapping | Implementado en alcance TTS |
| Marcar palabra completada | markWordCompleted use case | POST `/api/v1/content/vocabulary/:id/complete` | Handler local | Sin escritura | Handler solo devuelve `completed: true` | Simulado |
| Registrar aprendizaje | `/learn`, RecordLearningProgressUseCase | POST `/api/v1/progress/learn` | SRS.AddCardsToDeck → Gamification.RecordLearningProgress | `user_srs_progress`, `learning_progress_events`, `user_stats` | Test de idempotencia/concurrencia en Gamification; falta prueba de fallo parcial BFF | Parcial |
| Consultar resumen | `/dashboard` | GET `/api/v1/progress/summary` | Gamification.GetUserStats + consultas derivadas | `user_stats`, exámenes, SRS, achievements | Sin pruebas E2E ni validación académica | Parcial |
| Repasar vencidas | `/srs`, `/srs/session` | GET `/api/v1/srs/due` | SRS.GetDueCards | `user_srs_progress` | 2 tests de dominio SM-2 | Parcial |
| Guardar revisión | `/srs`, `/srs/session` | POST `/api/v1/srs/cards/:id/review` | SRS.ReviewCard | `user_srs_progress` | No se encontró una suite de integración exhaustiva | Parcial |

## Entrevista y evaluación

| Requisito/caso de uso | Frontend | HTTP BFF | RPC / propietario | Persistencia | Prueba/evidencia | Estado |
|---|---|---|---|---|---|---|
| Obtener pregunta | `/interview` | POST `/api/v1/exam/questions/next` | Auth.GetUserProfile → Content.GetRandomInterviewQuestion | `interview_questions` | Semilla de 8 preguntas; requiere validación editorial | Parcial |
| Capturar respuesta de voz | `/interview`, AudioWorklet + WS | POST ticket + GET WebSocket | BFF → AWS Transcribe Streaming | No se identificó persistencia de audio/transcripción en tabla de conversación | 11 tests del handler exam, pero faltan E2E de audio real | Parcial |
| Evaluar respuesta escrita | UI permite texto | POST `/api/v1/exam/evaluate` | AI.EvaluateExamAnswer → Bedrock | `ai_exam_sessions` existe; persistencia del resultado actual no demostrada | 2 unit tests de métrica/dominio | Parcial |
| Evaluar respuesta hablada | UI transcribe audio y luego envía texto | mismo endpoint de evaluación | AI Evaluator solo recibe texto | Sin almacenamiento/lectura de audio por evaluator | Handler rechaza payload de audio; prompt infiere oralidad desde texto | No válido como evaluación oral |
| Medir listening | Pregunta visible y TTS | flujo entrevista | Bedrock puntúa comprensión simulada desde texto | Sin ejercicio auditivo independiente | No existe prueba audio-first | No implementado |
| Generar drill adaptado a resultado | `/interview/drill` | GET `/api/v1/exam/results/:id/drill` | AI.GenerateTargetedDrill | No se demostró lectura de resultado identificado | Handler ignora `result_id` y fija debilidades | Parcial/simulado |
| Historial de evaluaciones | `/interview/result` recibe query params | no se encontró GET de historial | `ai_exam_sessions` en schema | Persistencia del resultado actual no demostrada | Sin prueba de historial | No verificado |

## Progreso académico objetivo

| Requisito | Módulo objetivo | Endpoint/RPC actual | Migración actual | Prueba actual | Estado |
|---|---|---|---|---|---|
| Curso y versión curricular | Learning/Curriculum domain | No existe | No existe | No existe | No implementado |
| Unidad y lección versionada | Learning engine | `lessons/today` es DTO derivado | No existe | No existe | No implementado |
| Objetivos académicos | Curriculum/assessment | No existe | No existe | No existe | No implementado |
| Actividades y tipos de ejercicio | Lesson/exercise engine | No existe | No existe | No existe | No implementado |
| Intentos y evidencias | Assessment domain | Solo evaluación de texto ad hoc | `ai_exam_sessions` parcial | No existe suite E2E | No implementado |
| Dominio por competencia/objetivo | Academic mastery | Nivel usuario y XP | Sin tabla de mastery | No existe | No implementado |
| Diagnóstico y plan adaptativo | Diagnostic/recommender | No existe | No existe | No existe | No implementado |

## Tutor, privacidad y proveedores

| Requisito | Frontend | HTTP/RPC actual | Datos | Prueba | Estado |
|---|---|---|---|---|---|
| Tutor conversacional multi-turno | No hay ruta | No hay endpoint/RPC | No hay tablas conversation/turn | No existe | No implementado |
| Escenarios conversacionales | No hay ruta | No existe | No existe | No existe | No implementado |
| Selector de proveedor conversacional Cloudflare/AWS | No hay setting de tutor | No existe adaptador conversacional | No existe | No existe | No implementado |
| TTS independiente del tutor | TTS en aprendizaje | `TTS_PROVIDER` actual | Configuración env | Suite del TTS existente | Parcial/implementado en alcance TTS |
| Privacidad/retención de conversación | No hay UI de control | No hay API | No hay tablas de conversación | No existe | No implementado |

## Cobertura RLS observada

| Tabla | RLS habilitado | FORCE RLS | Política observada |
|---|---:|---:|---|
| `user_srs_progress` | Sí | Sí | Aislamiento por usuario |
| `ai_exam_sessions` | Sí | Sí | Aislamiento por usuario |
| `user_stats` | Sí | Sí | Aislamiento por usuario + política lectura leaderboard |
| `learning_progress_events` | Sí | Sí | Aislamiento por usuario |
| `auth_refresh_tokens` | No encontrado | No encontrado | Sin política en las migraciones inspeccionadas |
| `users` | No encontrado | No encontrado | Sin política en las migraciones inspeccionadas |
| `vocabulary_words` / `context_sentences` | No encontrado | No encontrado | Catálogo compartido |
| `interview_questions` / `achievements` | No encontrado | No encontrado | Catálogo compartido |

## Huecos de trazabilidad que bloquean el gate

1. Falta prueba E2E por todos los flujos actualmente expuestos.
2. Faltan tests de contrato automatizados por cada RPC/HTTP.
3. Falta evidenciar persistencia de sesiones/resultados de evaluación.
4. Falta reconciliar los JSON A0/A1 con el catálogo SQL efectivamente desplegado.
5. Falta resolver las rutas y RPC que no tienen consumidor.
6. Falta prueba de fallo parcial entre SRS y gamificación.
7. Falta test de operación con proveedores externos reales o smoke tests opt-in.
8. Falta medición de cobertura, rendimiento y carga.
