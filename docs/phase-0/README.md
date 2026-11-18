# Fase 0 — Descubrimiento, inventario y diseño técnico

> Estado: **in_progress (validaciones operativas diferidas)**.
> Línea base inicial: commit de partida documentado en CI #174.
> Última actualización: 2026-11-16.
> Fuente rectora: [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md).

## Propósito

Documentar el comportamiento y la arquitectura que existen antes de cambiar el dominio académico. Esta fase establece inventario, decisiones y línea base. Las pruebas operativas pendientes quedan registradas y se ejecutarán cuando el entorno de prueba esté disponible; no bloquean el inicio de la Fase 1.

## Estado ejecutivo

| Subfase | Estado | Evidencia / pendiente |
|---|---|---|
| 0.1 Auditoría funcional | inventario estático completado | Pantallas, rutas HTTP, RPC, tablas y funciones completas/parciales/simuladas documentadas. Pendiente ejecutar recorridos E2E. |
| 0.2 Auditoría de arquitectura | auditoría estática completada | Responsabilidades, dependencias, consistencia y systemd documentados. PR #69 implementó límites SQLx, deadlines gRPC y límites AWS; falta validación operativa de fallos/recuperación. |
| 0.3 Decisiones de arquitectura | done | Los seis ADR están aceptados. ADR-0006 difiere retención/consentimiento concreto hasta antes de persistir conversaciones. |
| 0.4 Línea base de calidad | parcial; baseline instrumentada | Cobertura y fixtures añadidos por PR #68; límites de dependencias por PR #69. E2E, pruebas live de proveedores y carga representativa continúan pendientes. |

## Hallazgos funcionales y técnicos

1. El frontend contiene 14 páginas. No hay rutas de producto completas para cursos estructurados, unidades versionadas o tutor conversacional.
2. El BFF publica 21 rutas versionadas y `/health`. Los flujos actuales son vocabulario/lección del día, entrevista y repaso, no un motor académico completo.
3. Los seis contratos Protobuf declaran 24 RPC. Hay métodos declarados que no se observan llamados por el BFF.
4. Redis y NATS/JetStream aparecen en dependencias y Compose, pero no se encontró uso de clientes Redis/NATS en los fuentes Rust inspeccionados.
5. Los JSON de contenido contienen 322 palabras A0 y 469 A1, con tres frases por palabra. El servicio consulta PostgreSQL; el paquete de despliegue aplica migraciones SQL y no importa esos JSON. La migración semilla versionada contiene seis palabras. No se debe asumir que los 791 registros estén en la base desplegada.
6. La ruta `/api/v1/content/lessons/today` construye un DTO de lección con identificador, título y descripción codificados, y usa cinco palabras del nivel del usuario.
7. `/api/v1/content/vocabulary/:id/complete` responde `completed: true`, pero el handler inspeccionado no persiste esa marca.
8. La evaluación actual envía texto a Bedrock. Las métricas de pronunciación, fluidez y listening no están sustentadas por el audio original.
9. El Sistema Dual de Pronunciación existe en aprendizaje, pero el generador actual calcula dos veces la misma transliteración. Debe conservarse y mejorarse como herramienta didáctica, no como rúbrica.
10. El CI #168 del commit base fue documental y omitió las suites de código. La matriz completa #174 se ejecutó sobre el mismo árbol de código de aplicación: todos los jobs pasaron, incluidos 72 tests Rust. Se detectaron 21 vulnerabilidades npm low/moderate y una advertencia ESLint; no se reportaron vulnerabilidades npm high bajo el umbral configurado.

Los hallazgos anteriores son una línea base estática de auditoría. Se deben confirmar al modificar cada caso de uso. Las funciones simuladas o incompletas no se consideran comportamiento válido.

## Evidencia de calidad — PR #68 / CI #202

- **Rust:** 45,09% de líneas (1.846/4.094) y 29,55% de funciones (229/775), en 33 archivos. Se ejecutaron 75 tests; 75 pasaron.
- **Frontend TypeScript no visual:** 30,71% de líneas, 65,71% de ramas y 13,41% de funciones; 8 tests pasaron. No incluye componentes/páginas TSX, por lo que no representa cobertura visual ni E2E.
- Fixtures compartidos: `tests/fixtures/phase0/personas.json` y `tests/fixtures/phase0/content.json`.
- Generador reproducible: `tools/phase0/generate_synthetic_data.py --count 1000 --seed 20261102`. Genera datos JSONL; no escribe directamente en PostgreSQL.
- Escenario k6: `tests/load/bff-health-smoke.js`. Solo verifica `GET /health`, exige `BASE_URL` y bloquea el hostname productivo. No mide capacidad, throughput, percentiles ni SLO.
- Los porcentajes anteriores son una línea base, no un umbral mínimo de aceptación.

## Evidencia de límites — PR #69

Se añadieron en código y con pruebas deterministas:

- `DATABASE_ACQUIRE_TIMEOUT_SECONDS` en los cuatro pools PostgreSQL activos; default 5 s, máximo 30 s, con 10 conexiones por pool.
- Deadlines por cliente gRPC y metadato `grpc-timeout`: auth 10 s, content 45 s, AI 75 s, SRS 10 s, audio 45 s y gamification 10 s; timeout de conexión 3 s por defecto.
- `AWS_BEDROCK_TIMEOUT_SECONDS`: 60 s por defecto, máximo 300 s.
- `AWS_CONFIG_LOAD_TIMEOUT_SECONDS`: 10 s por defecto, máximo 30 s.
- `AWS_TRANSCRIBE_TIMEOUT_SECONDS`: 45 s por defecto, máximo 300 s; los errores de recepción del stream se propagan y no se sustituyen por una transcripción vacía.

Cloudflare TTS tuvo una llamada real satisfactoria en Deploy #32. PR #69 no prueba credenciales/llamadas reales de Polly, Transcribe ni Bedrock y no añade retry general ni circuit breaker. Redis/NATS no se incluyeron porque no se hallaron flujos runtime que los consuman.

## Documentos de la fase

- [Inventario funcional](functional-inventory.md)
- [Auditoría de arquitectura](architecture-audit.md)
- [Matriz de trazabilidad](traceability-matrix.md)
- [Diagramas C4](c4-diagrams.md)
- [Línea base de calidad](quality-baseline-2026-11-01.md)
- [Fixtures, datos sintéticos y smoke de carga](../../tools/phase0/README.md)
- [Escenario k6 de disponibilidad](../../tests/load/README.md)
- [Matriz de límites y errores](dependency-timeout-matrix.md)
- ADR-0001 a ADR-0006: decisiones de currículo, dominio, evaluación, proveedores, eventos y privacidad.

## Pendientes diferidos — no bloquean Fase 1

| Validación pendiente | Cuándo se ejecuta / condición |
|---|---|
| Recorridos E2E de registro, login, perfil, contenido, lecciones, progreso, SRS, gamificación y audio | Al disponer del entorno de prueba y datos reproducibles |
| Contratos HTTP/gRPC, persistencia, permisos, aislamiento, idempotencia y concurrencia | Durante la validación de integración; cada nuevo contrato de Fase 1 tendrá pruebas propias |
| Fallos de PostgreSQL, timeouts, desconexiones y recuperación | Con entorno controlado, sin generar carga en producción |
| Llamadas reales a Polly, Transcribe y Bedrock | Cuando estén disponibles credenciales y cuotas de prueba |
| Carga k6 con p50/p95/p99, throughput y tasa de errores | Cuando se disponga de una URL/VM aislada autorizada |
| Verificación de los límites y variables efectivas en las VMs | Durante la preparación y puesta a punto de las VMs de prueba |

**Decisión de continuidad:** la Fase 1 puede comenzar en paralelo con estas validaciones. No se declara cerrada la Fase 0 hasta que se adjunten las evidencias correspondientes. La deuda de validación no exime de probar cada migración, API o flujo nuevo que se implemente en Fase 1.

## Criterios de seguimiento

| Criterio | Estado |
|---|---|
| Flujos y capacidades actuales inventariados | Completado a nivel estático; E2E diferido |
| Endpoints/RPC críticos con propietario documentado | Completado; los no consumidos están identificados |
| Timeouts/deadlines y manejo de errores en dependencias activas | Implementados en código y tests deterministas; prueba operativa diferida |
| ADR aprobados | Completado: ADR-0001 a ADR-0006 |
| CI completo de línea base | Completado: CI #174 |
| Cobertura, fixtures y generador reproducible | Completado como baseline: PR #68 / CI #202 |
| Capacidad, latencia bajo carga y recuperación | Pendiente: el smoke k6 no sustituye esta medición |
| E2E y llamadas reales de todos los proveedores habilitados | Pendiente |

**Gate de continuidad: FASE 1 AUTORIZADA.** La Fase 0 permanece **abierta** por validaciones diferidas, pero no bloquea el avance de las siguientes fases.
