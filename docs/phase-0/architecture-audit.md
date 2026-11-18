# Auditoría de arquitectura — Fase 0.2

> Actualización al 2026-11-16: las referencias históricas a ausencia de deadlines gRPC, timeouts de adquisición SQLx o timeout de Bedrock quedan supersedidas por PR #69. La implementación actual y sus límites se describen en las secciones 2 y 4. La validación operativa queda pendiente y no bloquea el inicio de Fase 1.

## 1. Vista actual de servicios

| Componente | Responsabilidad observada | Dependencias directas | Estado |
|---|---|---|---|
| Next.js frontend | UI, casos de uso y repositorios HTTP; AudioWorklet para micrófono | BFF HTTP/WebSocket, navegador y micrófono | Tests parciales de lógica TypeScript; faltan E2E y cobertura visual/TSX |
| BFF Axum | HTTP, autenticación de requests, orquestación gRPC, WebSocket Transcribe, rate limit local | 6 clientes gRPC, AWS Transcribe, memoria local | Existe; concentra orquestación y flujo STT |
| Auth Identity | Registro/login, JWT, refresh token, perfil | PostgreSQL | Funcionalidad implementada, con pruebas de auth |
| Content Vocabulary | Consulta vocabulario/frases/preguntas | PostgreSQL | No carga JSON seed al arrancar |
| AI Evaluator | Evalúa texto y genera drill | AWS Bedrock | No recibe audio original |
| Phonetic Audio | Transliteración, TTS, RPC de transcripción | AWS Polly o Cloudflare Workers AI para TTS; AWS Transcribe para STT | TTS configurable; ruta STT del BFF usa streaming |
| SRS Engine | Tarjetas y algoritmo SM-2 | PostgreSQL | Implementación base |
| Gamification Progress | XP, monedas, racha, leaderboard, achievements, ledger de progreso | PostgreSQL | Ledger de progreso idempotente |
| PostgreSQL | Persistencia principal | SQLx desde cuatro servicios | Activa en arquitectura |
| Redis | Caché/rate limit compartido potencial | Dependencia Compose/Cargo | No se encontró cliente/uso real en Rust |
| NATS/JetStream | Mensajería potencial | Dependencia Compose/Cargo | No se encontró cliente/consumer/publisher real |

### Puertos y bind addresses

| Proceso | Variable | Default de código |
|---|---|---|
| BFF | `BFF_HTTP_BIND_ADDR` | `127.0.0.1:8080` |
| Auth | `AUTH_SERVICE_BIND_ADDR` | `127.0.0.1:50051` |
| Content | `CONTENT_SERVICE_BIND_ADDR` | `127.0.0.1:50052` |
| AI Evaluator | `AI_SERVICE_BIND_ADDR` | `127.0.0.1:50053` |
| Phonetic Audio | `PHONETIC_SERVICE_BIND_ADDR` | `127.0.0.1:50054` |
| SRS | `SRS_SERVICE_BIND_ADDR` | `127.0.0.1:50055` |
| Gamification | `GAMIFICATION_SERVICE_BIND_ADDR` | `127.0.0.1:50056` |
| Frontend | unit systemd | `127.0.0.1:3000` |

El BFF usa `connect_lazy` para gRPC. La URL del cliente de audio admite `PHONETIC_SERVICE_GRPC_URL`; las demás direcciones de cliente se construyen con loopback fijo en el archivo inspeccionado.

## 2. Dependencias efectivas

### PostgreSQL

Auth, Content, SRS y Gamification construyen un pool SQLx con `max_connections(10)` y `acquire_timeout` configurable mediante `DATABASE_ACQUIRE_TIMEOUT_SECONDS` (5 s por defecto, máximo 30 s; añadido en PR #69). El proceso falla al iniciar si no obtiene conexión. Las pruebas de integración usan `TEST_DATABASE_URL`. La saturación del pool y la recuperación tras caída siguen pendientes de validación operativa.

### Redis

`fred` aparece en `Cargo.toml`, y Redis 7.2 está definido en `docker-compose.yml`. No se encontró importación ni llamada de cliente Redis en los 37 archivos Rust inspeccionados.

El rate limiter de BFF usa `OnceLock<Mutex<HashMap<...>>>` en memoria. El propio comentario del código indica que un store compartido (por ejemplo Redis) sería necesario con múltiples réplicas. Consecuencia: los contadores no se comparten entre procesos/instancias y se reinician con el proceso.

### NATS / JetStream

`async-nats` aparece como dependencia, y Compose inicia NATS con JetStream habilitado. No se encontró publisher, subscriber, stream, consumer ni API `async_nats` en el código Rust inspeccionado. No documentar NATS como bus operacional hasta implementar y probar un flujo real.

### Proveedores externos encontrados

| Dependencia | Consumidor actual | Configuración observable | Manejo de error / timeout |
|---|---|---|---|
| AWS Bedrock | AI Evaluator | `AWS_REGION`, `AWS_BEDROCK_TEXT_EVAL_MODEL_ID` o `AWS_BEDROCK_MODEL_ID`; `AWS_BEDROCK_TIMEOUT_SECONDS` (60 s por defecto, máximo 300 s) | Timeout explícito de operación/carga de configuración; errores externos se convierten en error de servicio. Falta validar llamadas y clasificación de errores reales |
| AWS Polly | TTS audio | Región/voz y `AWS_POLLY_TIMEOUT_SECONDS` | Timeout propio y error tipado |
| Cloudflare Workers AI | TTS audio | Account ID, API token, modelo, speaker, `CLOUDFLARE_TTS_TIMEOUT_SECONDS` | Timeout, clasificación de status, no fallback silencioso |
| AWS Transcribe | Streaming STT en BFF y operación unary en Audio | `AWS_REGION`, `AWS_TRANSCRIBE_LANGUAGE_CODE`, `AWS_CONFIG_LOAD_TIMEOUT_SECONDS` (10 s default, máximo 30 s); unary: `AWS_TRANSCRIBE_TIMEOUT_SECONDS` (45 s default, máximo 300 s) | Errores de recepción se propagan y timeout unary se mapea a `DeadlineExceeded`; falta E2E de desconexión/reanudación y prueba real completa |
| Browser Media APIs | Captura de voz | Permiso de micrófono, AudioContext 16 kHz, AudioWorklet | Errores locales de permisos/dispositivo/conexión |

No se encontró el adaptador conversacional Cloudflare/AWS definido como objetivo. Cloudflare TTS no equivale al proveedor conversacional.

## 3. Comunicación y consistencia

### Llamadas síncronas relevantes

- BFF → Auth para validar identidad y recuperar perfil.
- BFF → Content para listar vocabulario y obtener preguntas.
- BFF → AI Evaluator para evaluar texto y generar ejercicios de refuerzo.
- BFF → Audio para sintetizar TTS.
- BFF → SRS para revisar/añadir tarjetas.
- BFF → Gamification para stats, achievements, leaderboard y avance.
- BFF → AWS Transcribe Streaming durante la captura en WebSocket.

### Flujo con riesgo de efecto parcial

`POST /api/v1/progress/learn`:

1. Llama a `SRS.AddCardsToDeck`.
2. Después llama a `Gamification.RecordLearningProgress`.
3. Si la segunda llamada falla, la tarjeta puede haberse creado sin que se concedan XP/monedas.

Gamification sí tiene un ledger idempotente con unicidad `(user_id, word_id)` y transacción. Esa garantía no convierte la secuencia de dos servicios en una transacción distribuida.

### Recomendación de fase 0

Mantener el flujo síncrono hasta diseñar consistencia. No sustituir la secuencia por eventos sin definir evento de dominio, idempotency key, transactional outbox, consumidor idempotente, política de reintentos y reconciliación. NATS puede ser adecuado para eventos tolerantes a consistencia eventual, no para ocultar una operación parcialmente aplicada.

## 4. Timeouts, reintentos, circuit breakers y shutdown

| Área | Evidencia en código | Evaluación |
|---|---|---|
| Frontend → BFF HTTP | AbortController; default 30 s; evaluación/drill hasta 90 s | Timeout de cliente; E2E de cancelación y recuperación pendiente |
| TTS proveedores | Timeouts separados para Polly y Cloudflare; carga de configuración AWS limitada a 10 s por defecto | Evidencia de código; Cloudflare TTS tiene smoke real, Polly live pendiente |
| AWS Transcribe | Carga de configuración con límite de 10 s por defecto; operación unary con 45 s por defecto y máximo 300 s; los errores de stream se propagan | Código y tests deterministas en PR #69; falta prueba real de streaming, desconexión y recuperación |
| gRPC BFF → servicios | Timeout local de conexión de 3 s por defecto; deadlines por servicio (Auth 10 s, Content 45 s, AI 75 s, SRS 10 s, Audio 45 s y Gamification 10 s) con interceptor que añade metadato `grpc-timeout` | Implementado y con tests deterministas en PR #69; falta inducir latencia/corte de red en entorno controlado |
| PostgreSQL SQLx | Cuatro pools con `max_connections=10` y `DATABASE_ACQUIRE_TIMEOUT_SECONDS=5` por defecto (máximo 30 s) | Implementado en PR #69; falta prueba de saturación y recuperación del pool |
| AWS Bedrock | `AWS_BEDROCK_TIMEOUT_SECONDS=60` por defecto, máximo 300 s; abarca carga de config/credenciales y operación | Implementado y test determinista; faltan llamadas reales y pruebas de cuota/error del proveedor |
| Reintentos | No se encontró política general de reintentos gRPC | Pendiente; no añadir retries ciegos a operaciones no idempotentes |
| Circuit breaker | No se encontró implementación | Pendiente; evaluar cuando haya un caso operacional y una política de degradación justificable |
| Graceful shutdown | Servidores usan `.serve(addr)`; no se encontró `serve_with_shutdown` | Pendiente; se puede tratar como mejora de resiliencia, no como bloqueo para el diseño curricular |
| systemd | `SIGTERM`, `TimeoutStopSec=30`, restart on failure, 5 s | systemd reinicia; no demuestra shutdown ordenado de recursos internos |

No se debe añadir retry global sin clasificar errores transitorios/permanentes y sin idempotencia. En particular, registro, rotación de refresh tokens y operaciones de progreso necesitan semántica explícita.

La validación de fallos, latencia y recuperación se mantiene como pendiente diferido de Fase 0. No bloquea el inicio de Fase 1; cada operación nueva que se introduzca debe definir sus propios límites y pruebas en su PR.

## 5. systemd y configuración

Unidades encontradas:

- `devfluency.target`: agrupa los seis microservicios y el BFF.
- `devfluency@.service`: plantilla para procesos Rust.
- `devfluency-frontend.service`: proceso Next standalone.

La plantilla Rust declara:

- Usuario/grupo de sistema `devfluency`.
- WorkingDirectory bajo `/opt/apps/plataforma-aprendizaje/current`.
- EnvironmentFile: `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env`.
- Reinicio on failure, `SIGTERM`, stop timeout de 30 s.
- Hardening: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`.

El frontend ejecuta `node server.js` en puerto 3000, host 127.0.0.1. El bootstrap prepara el EnvironmentFile y unidades, pero este inventario no copia ni revela valores secretos.

### Variables de entorno identificadas (nombres solamente)

| Área | Variables |
|---|---|
| Compartidas | `DATABASE_URL`, `JWT_SECRET`, `RUST_LOG` |
| Bind y servicios | `BFF_HTTP_BIND_ADDR`, `AUTH_SERVICE_BIND_ADDR`, `CONTENT_SERVICE_BIND_ADDR`, `AI_SERVICE_BIND_ADDR`, `PHONETIC_SERVICE_BIND_ADDR`, `SRS_SERVICE_BIND_ADDR`, `GAMIFICATION_SERVICE_BIND_ADDR`, `PHONETIC_SERVICE_GRPC_URL` |
| BFF / browser | `CORS_ALLOWED_ORIGINS`, `NEXT_PUBLIC_BFF_URL` |
| AWS | `AWS_REGION`, `AWS_BEDROCK_TEXT_EVAL_MODEL_ID`, `AWS_BEDROCK_MODEL_ID`, `AWS_POLLY_VOICE_ID`, `AWS_POLLY_TIMEOUT_SECONDS`, `AWS_TRANSCRIBE_LANGUAGE_CODE` |
| Cloudflare TTS | `TTS_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_TTS_MODEL_EN`, `CLOUDFLARE_TTS_MODEL_ES`, `CLOUDFLARE_TTS_SPEAKER_EN`, `CLOUDFLARE_TTS_SPEAKER_ES`, `CLOUDFLARE_TTS_TIMEOUT_SECONDS` |
| Frontend systemd | `NODE_ENV`, `HOSTNAME`, `PORT` |

`REDIS_URL` y `NATS_URL` aparecen en el archivo de bootstrap, pero no se encontraron consumidores de esas variables en el código Rust inspeccionado.

## 6. Persistencia, migraciones y rollback

Hay nueve migraciones SQL. El deploy empaqueta los binarios, frontend standalone, unidades/scripts y migraciones. Ejecuta SQLx `migrate run` antes de cambiar el enlace `current` y reiniciar procesos. Si falla la migración, no activa la nueva versión de aplicación. Si falla el restart/health check, puede volver al release binario anterior.

El rollback de binarios no revierte automáticamente migraciones ya aplicadas. Las futuras migraciones académicas deben ser compatibles con despliegues graduales y tener un plan separado para reversión o forward-fix.

## 7. Riesgos y acciones resultantes

| ID | Riesgo | Acción previa a implementación |
|---|---|---|
| A-01 | Redis/NATS declarados pero no usados | Definir si existe necesidad real; retirar dependencias/config sin uso o justificar/implementar con tests |
| A-02 | Rate limit solo local | Definir número de réplicas y persistencia compartida |
| A-03 | Deadlines gRPC implementados; comportamiento bajo fallo de red aún no validado | Ejecutar pruebas controladas de latencia, timeout y recuperación |
| A-04 | Timeout de adquisición SQLx implementado; saturación del pool no validada | Medir saturación/recuperación y revisar límites con datos de carga |
| A-05 | Shutdown ordenado no demostrado | Añadir señal de terminación y tests |
| A-06 | Progreso cruza SRS/Gamification secuencialmente | Decidir transacción, saga o outbox con idempotencia |
| A-07 | Migración SQL y rollback binario separados | Documentar estrategia de compatibilidad/rollback |
| A-08 | BFF concentra STT streaming y orquestación | Evaluar ownership del flujo y límites de recursos |
| A-09 | Variables compartidas en EnvironmentFile | Documentar por servicio variables realmente requeridas y menor privilegio |
