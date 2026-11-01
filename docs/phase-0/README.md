# Fase 0 — Descubrimiento, inventario y diseño técnico

> Estado: **in_progress**.
> Línea base inspeccionada: `main` en `a905574425b650ac1ebf0ac054a0169ce4f47cab`.
> Fecha de auditoría: 2026-11-01.
> Fuente rectora: [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md).

## Propósito

Documentar el comportamiento y la arquitectura que existen antes de cambiar el dominio académico. Esta fase no introduce migraciones académicas ni cambios de comportamiento. Los hallazgos describen el repositorio; no sustituyen pruebas de operación en producción.

## Estado ejecutivo

| Subfase | Estado | Evidencia / pendiente |
|---|---|---|
| 0.1 Auditoría funcional | in_progress | Inventario de páginas, rutas HTTP, RPC y tablas levantado. Falta validar recorridos E2E y confirmar el estado operativo de cada flujo. |
| 0.2 Auditoría de arquitectura | in_progress | Responsabilidades, dependencias, comunicación y systemd documentados. Falta medir comportamiento en entorno representativo y verificar límites efectivos. |
| 0.3 Decisiones de arquitectura | in_progress | Seis ADR redactados. ADR-0003 refleja la decisión acordada; los demás siguen propuestos y requieren aprobación. |
| 0.4 Línea base de calidad | blocked | CI documental pasa. Falta ejecutar el workflow_dispatch de CI completo, registrar cobertura y obtener métricas de carga/rendimiento. |

## Hallazgos que condicionan las siguientes fases

1. El frontend contiene 14 páginas. No hay rutas de producto para cursos estructurados, unidades o tutor conversacional.
2. El BFF publica 21 rutas versionadas y `/health`. Los flujos actuales son vocabulario/lección del día, entrevista y repaso, no un motor académico completo.
3. Los seis contratos Protobuf declaran 24 RPC. Hay métodos declarados que no se observan llamados por el BFF.
4. Redis y NATS/JetStream aparecen en dependencias y Compose, pero no se encontró uso de clientes Redis/NATS en los fuentes Rust inspeccionados.
5. Los JSON de contenido contienen 322 palabras A0 y 469 A1, con tres frases por palabra. El servicio consulta PostgreSQL; el paquete de despliegue aplica migraciones SQL y no importa esos JSON. La migración semilla versionada contiene seis palabras. No se debe asumir que los 791 registros estén en la base desplegada.
6. La ruta `/api/v1/content/lessons/today` construye un DTO de lección con identificador, título y descripción codificados, y usa cinco palabras del nivel del usuario.
7. `/api/v1/content/vocabulary/:id/complete` responde `completed: true`, pero el handler inspeccionado no persiste esa marca.
8. La evaluación actual envía texto a Bedrock. Las métricas de pronunciación, fluidez y listening no están sustentadas por el audio original.
9. El Sistema Dual de Pronunciación existe en aprendizaje, pero el generador actual calcula dos veces la misma transliteración. Debe conservarse y mejorarse como herramienta didáctica, no como rúbrica.
10. El CI del commit auditado fue exitoso como validación documental; omitió compilación, lint y tests de Rust/frontend, auditorías de dependencias y shell validation.

## Documentos de la fase

- [Inventario funcional](functional-inventory.md)
- [Auditoría de arquitectura](architecture-audit.md)
- [Matriz de trazabilidad](traceability-matrix.md)
- [Diagramas C4](c4-diagrams.md)
- [Línea base de calidad](quality-baseline-2026-11-01.md)
- ADR-0001: [Modelo curricular y catálogo](../adr/0001-curriculum-and-content-model.md)
- ADR-0002: [Dominio del aprendizaje](../adr/0002-learning-domain-model.md)
- ADR-0003: [Evaluación y dominio académico](../adr/0003-assessment-and-academic-mastery.md)
- ADR-0004: [Proveedores conversacionales](../adr/0004-conversational-ai-provider-adapters.md)
- ADR-0005: [Eventos y consistencia](../adr/0005-events-and-consistency.md)
- ADR-0006: [Privacidad y retención de conversaciones](../adr/0006-conversation-privacy-retention.md)

## Criterios del gate

| Criterio | Estado |
|---|---|
| Todos los flujos expuestos están inventariados | Parcial: inventario estático realizado; faltan recorridos E2E y validación de producción |
| Endpoints/RPC críticos tienen propietario documentado | Parcial: propietario técnico asignado por módulo; faltan acuerdos para RPC huérfanos |
| Dependencias externas tienen timeout, error y configuración evidenciados | Parcial: TTS y transcripción tienen controles visibles; faltan deadlines gRPC/DB y evidencia operativa de todos los proveedores |
| ADR aprobados | Parcial: ADR-0003 aceptado; cinco propuestas pendientes |
| CI completo pasa en el commit de partida | Pendiente |
| Cobertura y rendimiento iniciales registrados | Pendiente |

**Gate de salida: NO APROBADO.** No iniciar migraciones académicas estructurales ni cambiar el modelo de persistencia hasta que se cierre la línea base, se aprueben los ADR y se confirme el alcance técnico.
