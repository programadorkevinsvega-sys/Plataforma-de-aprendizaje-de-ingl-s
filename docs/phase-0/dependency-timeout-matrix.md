# Matriz de dependencias, límites y errores — Fase 0

> Inspección estática de `main` a 2026-11-03. Esta matriz separa lo que se observa en código de lo que todavía no está validado en ejecución. No representa una prueba de disponibilidad de proveedores externos.

## Dependencias activas observadas

| Dependencia / tramo | Consumidor | Timeout o deadline observado | Errores / degradación observados | Estado de aceptación |
|---|---|---|---|---|
| Frontend → BFF HTTP | `BffHttpClient` | `AbortController` por defecto 30 s; algunas operaciones de evaluación/drill solicitan 60–90 s | Convierte abort y fallo de conexión a `BffUnavailableError`; limpia timer en `finally` | Parcial: timeout cliente sí; falta prueba E2E de desconexión/recuperación |
| BFF → Auth gRPC | BFF | Canal `connect_lazy`; no se encontró `Request::set_timeout` ni deadline común por RPC | Los handlers mapean algunos códigos gRPC, no hay política uniforme verificada | Pendiente |
| BFF → Content gRPC | BFF | Canal `connect_lazy`; no se encontró deadline por RPC | TTS traduce `DeadlineExceeded` a 503 `TTS_PROVIDER_TIMEOUT`; otros RPC necesitan revisión homogénea | Parcial |
| BFF → AI Evaluator gRPC | BFF | Canal `connect_lazy`; no se encontró deadline por RPC | Error de servicio tratado en handlers, sin límite común de espera | Pendiente |
| BFF → SRS gRPC | BFF | Canal `connect_lazy`; no se encontró deadline por RPC | Sin deadline común observado | Pendiente |
| BFF → Gamification gRPC | BFF | Canal `connect_lazy`; no se encontró deadline por RPC | El ledger tiene idempotencia en su servicio; la llamada BFF no tiene deadline común observado | Pendiente |
| Auth → PostgreSQL | Auth Identity | Pool `max_connections(10)`; no aparece `acquire_timeout` en el constructor | Falla durante inicio si no conecta; no hay límite explícito de espera de adquisición en pool | Pendiente |
| Content → PostgreSQL | Content Vocabulary | Pool `max_connections(10)`; no aparece `acquire_timeout` | Falla durante inicio si no conecta | Pendiente |
| SRS → PostgreSQL | SRS Engine | Pool `max_connections(10)`; no aparece `acquire_timeout` | Falla durante inicio si no conecta | Pendiente |
| Gamification → PostgreSQL | Gamification Progress | Pool `max_connections(10)`; no aparece `acquire_timeout` | Falla durante inicio si no conecta | Pendiente |
| AI Evaluator → AWS Bedrock | AI Evaluator | No se encontró timeout explícito de aplicación/SDK en la llamada `converse().send()` | Error se convierte en `DomainError::ExternalServiceError`; no se encontró clasificación explícita de timeout/429/auth | Pendiente |
| Audio → AWS Polly | Phonetic Audio | `AWS_POLLY_TIMEOUT_SECONDS`, default 30 s; `tokio::time::timeout` alrededor de la síntesis | `TtsError` tipado para timeout, rate limit, autenticación y upstream | Evidencia de código y tests; falta prueba real con Polly |
| Audio → Cloudflare Workers AI (TTS) | Phonetic Audio | `CLOUDFLARE_TTS_TIMEOUT_SECONDS`, default 30 s; `reqwest::Client::timeout` | Clasifica HTTP 401/403, 408/504, 429 y upstream; no hace fallback silencioso | Evidencia de código, tests y smoke real de Deploy #32 |
| BFF → AWS Transcribe Streaming | BFF | Timeout de 30 s al iniciar stream y límite de duración de sesión | La ruta WebSocket clasifica errores de sesión/transcripción; falta prueba de desconexión/reanudación completa | Parcial |
| Navegador → micrófono / AudioWorklet | Frontend | No es dependencia HTTP; sesión de captura limitada por flujo STT | Maneja permisos, dispositivo y conexión en cliente | Parcial; falta E2E de navegador |

## Componentes no activos como dependencias de runtime

- **Redis:** dependencia declarada en manifiestos/Compose, pero la auditoría de los fuentes Rust no encontró llamadas al cliente `fred`. El rate limiter del BFF usa memoria local. No marcar Redis como dependencia operativa comprobada.
- **NATS/JetStream:** aparece en manifiestos/Compose, pero no se encontró publisher, subscriber, stream ni consumer en el código Rust inspeccionado. No marcar NATS como dependencia operativa comprobada.

## Evidencia útil ya ejecutada

- Deploy Ubuntu #32 desplegó SHA `40435342a7b0689b5916893c238c53cb098f8086`.
- La activación de ese release ejecutó una síntesis real con Cloudflare TTS y pasó los health checks HTTP y TTS.
- Esa ejecución no prueba Polly, Bedrock, Transcribe streaming ni la disponibilidad de todos los RPC.

## Trabajo necesario para aprobar el criterio de dependencias

1. Definir deadlines por clase de RPC y propagarlos como metadato gRPC reconocido por Tonic, además de un límite de espera en el cliente.
2. Configurar límites explícitos `acquire_timeout` en los cuatro pools SQLx y documentar el número máximo de conexiones por servicio/host.
3. Definir timeout de operación para Bedrock y mapear timeout, autenticación, cuota/rate-limit y errores upstream sin ocultarlos.
4. Probar los errores anteriores con mocks/servidores controlados, incluyendo timeout, cancelación y recuperación.
5. Ejecutar pruebas de integración/E2E en staging para proveedores habilitados. No usar producción como entorno de carga.
6. Registrar límites y configuración efectivos por servicio sin exponer valores secretos.

## Regla de cierre

Una dependencia solo puede marcarse como verificada cuando existen: configuración nombrada, límite efectivo, error tipado o respuesta controlada, test reproducible y evidencia de ejecución CI. Una línea de código o un health check genérico no son suficientes por sí solos.
