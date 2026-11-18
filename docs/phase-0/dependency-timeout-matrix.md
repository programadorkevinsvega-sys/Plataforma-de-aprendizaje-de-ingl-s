# Matriz de dependencias, límites y errores — Fase 0

> Estado de código inspeccionado en `main` a 2026-11-16. PR #69 implementó límites configurables y pruebas deterministas. Esta matriz distingue esa evidencia de las pruebas operativas aún pendientes; no representa una prueba de disponibilidad de todos los proveedores.

## Dependencias activas observadas

| Dependencia / tramo | Consumidor | Timeout o deadline implementado | Errores / degradación observados | Estado de aceptación |
|---|---|---|---|---|
| Frontend → BFF HTTP | `BffHttpClient` | `AbortController` por defecto 30 s; algunas operaciones de evaluación/drill solicitan 60–90 s | Convierte abort y fallo de conexión a `BffUnavailableError`; limpia timer en `finally` | Código existente; E2E de desconexión y recuperación pendiente |
| BFF → Auth gRPC | BFF | `GRPC_AUTH_DEADLINE_SECONDS`, default 10 s; timeout local + metadato `grpc-timeout`; conexión default 3 s | El handler mapea códigos gRPC a respuestas HTTP | Implementado y con test de interceptor; fallo de red/recuperación runtime pendiente |
| BFF → Content gRPC | BFF | `GRPC_CONTENT_DEADLINE_SECONDS`, default 45 s; timeout local + `grpc-timeout` | Errores gRPC se propagan a handlers | Implementado y con test de interceptor; fallo de red/recuperación runtime pendiente |
| BFF → AI Evaluator gRPC | BFF | `GRPC_AI_DEADLINE_SECONDS`, default 75 s; timeout local + `grpc-timeout` | Errores gRPC se propagan; Bedrock tiene límite adicional en el servicio | Implementado y con test de interceptor; prueba de proveedor real pendiente |
| BFF → SRS gRPC | BFF | `GRPC_SRS_DEADLINE_SECONDS`, default 10 s; timeout local + `grpc-timeout` | Error gRPC explícito; no se añade retry automático | Implementado y con test de interceptor; fallo de red/recuperación runtime pendiente |
| BFF → Gamification gRPC | BFF | `GRPC_GAMIFICATION_DEADLINE_SECONDS`, default 10 s; timeout local + `grpc-timeout` | Ledger idempotente dentro del servicio; secuencia distribuida con SRS sigue pudiendo tener efecto parcial | Implementado y con test de interceptor; prueba de efecto parcial pendiente |
| BFF → Phonetic Audio gRPC | BFF | `GRPC_AUDIO_DEADLINE_SECONDS`, default 45 s; timeout local + `grpc-timeout` | Los timeouts se propagan como deadline excedido | Implementado y con test de interceptor; fallo de proveedor en ejecución pendiente |
| Auth → PostgreSQL | Auth Identity | `DATABASE_ACQUIRE_TIMEOUT_SECONDS`, default 5 s, máximo 30 s; `max_connections=10` | Fallo explícito si no se adquiere conexión; proceso falla al inicio si DB no conecta | Implementado; saturación del pool y recuperación runtime pendientes |
| Content → PostgreSQL | Content Vocabulary | `DATABASE_ACQUIRE_TIMEOUT_SECONDS`, default 5 s, máximo 30 s; `max_connections=10` | Igual política de adquisición | Implementado; saturación del pool y recuperación runtime pendientes |
| SRS → PostgreSQL | SRS Engine | `DATABASE_ACQUIRE_TIMEOUT_SECONDS`, default 5 s, máximo 30 s; `max_connections=10` | Igual política de adquisición | Implementado; saturación del pool y recuperación runtime pendientes |
| Gamification → PostgreSQL | Gamification Progress | `DATABASE_ACQUIRE_TIMEOUT_SECONDS`, default 5 s, máximo 30 s; `max_connections=10` | Igual política de adquisición | Implementado; saturación del pool y recuperación runtime pendientes |
| AI Evaluator → AWS Bedrock | AI Evaluator | `AWS_BEDROCK_TIMEOUT_SECONDS`, default 60 s, máximo 300 s; incluye carga de configuración/credenciales y operación | Los errores externos se devuelven como error de servicio; no se documenta una clasificación completa de 401/429/5xx | Timeout y tests deterministas implementados; llamada real, cuotas y latencia pendientes |
| Audio → AWS Polly | Phonetic Audio | `AWS_POLLY_TIMEOUT_SECONDS` default 30 s; carga de configuración AWS limitada por `AWS_CONFIG_LOAD_TIMEOUT_SECONDS` (default 10 s, máximo 30 s) | `TtsError` tipado para timeout, rate limit, autenticación y upstream | Tests/código presentes; prueba real con Polly pendiente |
| Audio → Cloudflare Workers AI (TTS) | Phonetic Audio | `CLOUDFLARE_TTS_TIMEOUT_SECONDS`, default 30 s; `reqwest::Client::timeout` | Clasifica HTTP 401/403, 408/504, 429 y upstream; no hace fallback silencioso | Evidencia de código y smoke real satisfactorio en Deploy #32 |
| BFF → AWS Transcribe Streaming | BFF | Carga de configuración AWS limitada por `AWS_CONFIG_LOAD_TIMEOUT_SECONDS` (default 10 s, máximo 30 s); la sesión tiene límites propios | Errores de configuración/inicio se notifican; faltan pruebas de desconexión/reanudación del WebSocket | Código con timeout; prueba live de streaming y recuperación pendiente |
| Phonetic Audio → AWS Transcribe unary | Phonetic Audio | `AWS_TRANSCRIBE_TIMEOUT_SECONDS`, default 45 s, máximo 300 s; cubre la operación unary | Errores de recepción del stream se propagan; timeout se convierte en `DeadlineExceeded` | Código y tests deterministas; llamada real/latencia pendiente |
| Navegador → micrófono / AudioWorklet | Frontend | No es dependencia HTTP; el ciclo de captura depende del flujo STT | Maneja permisos, dispositivo y conexión en cliente | Parcial; E2E de navegador pendiente |

## Componentes no activos como dependencias de runtime

- **Redis:** dependencia declarada en manifiestos/Compose, pero la auditoría de los fuentes Rust no encontró llamadas al cliente `fred`. El rate limiter del BFF usa memoria local. No marcar Redis como dependencia operativa comprobada.
- **NATS/JetStream:** aparece en manifiestos/Compose, pero no se encontró publisher, subscriber, stream ni consumer en el código Rust inspeccionado. No marcar NATS como dependencia operativa comprobada.

## Evidencia ya ejecutada

- PR #69 (merge commit `6cd10338fba6494626e6692ea6f5674f68786862`) añadió los timeouts de adquisición SQLx, deadlines gRPC, timeout Bedrock y límites AWS de configuración/Transcribe, más tests deterministas.
- Deploy Ubuntu #32 ejecutó una síntesis real con Cloudflare TTS y pasó health checks HTTP y TTS.
- La CI prueba parser de timeout, metadato gRPC, timeout/error controlado de Bedrock y timeout/error controlado de Transcribe. Estas pruebas no llaman a los proveedores reales.

## Validación operativa pendiente

1. Inducir agotamiento de conexiones PostgreSQL y verificar timeout/recovery.
2. Cortar o retrasar RPC gRPC para comprobar deadline, cancelación y respuesta del BFF.
3. Probar Bedrock, Polly y Transcribe con credenciales de prueba, cuota controlada y fallos 401/403/429/5xx cuando se puedan simular con seguridad.
4. Probar desconexión y reanudación del WebSocket STT; comprobar que no se fabrica una transcripción vacía ante un error.
5. Medir latencias y comportamiento bajo carga; no utilizar producción como destino de carga.
6. Registrar valores efectivos por servicio y ambiente sin exponer secretos.

## Regla de cierre

Una dependencia solo puede marcarse como verificada cuando existen: configuración nombrada, límite efectivo, error tipado o respuesta controlada, test reproducible y evidencia de ejecución en el entorno previsto. Una línea de código o un health check genérico no son suficientes por sí solos. Estas validaciones pendientes no bloquean el inicio de la Fase 1.
