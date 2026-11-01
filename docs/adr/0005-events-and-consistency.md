# ADR-0005 — Eventos y consistencia entre servicios

- Estado: **Proposed**
- Fecha: 2026-11-01
- Fase: 0.3
- Decisores: pendiente de aprobación.

## Contexto

El BFF coordina operaciones síncronas. El endpoint `/api/v1/progress/learn` solicita primero añadir tarjeta al SRS y después registrar progreso/recompensa en Gamification. El servicio Gamification tiene un ledger idempotente con unicidad `(user_id, word_id)`, pero la secuencia completa puede fallar entre servicios.

NATS/JetStream y Redis están definidos en Compose/dependencias, pero no se encontró publisher/consumer ni uso real de clientes en el código.

## Decisión propuesta

1. PostgreSQL sigue siendo la fuente de verdad para datos transaccionales.
2. Mantener síncronas las operaciones que requieren respuesta inmediata o consistencia fuerte, mientras no exista un diseño seguro alternativo.
3. Usar eventos solo cuando el consumidor tolere consistencia eventual y exista un contrato de evento versionado.
4. Cuando un cambio de PostgreSQL deba emitir un evento sin perderlo, escribir estado y outbox en la misma transacción.
5. Los consumidores usan inbox/idempotency key, control de duplicados, reintentos limitados y dead-letter/recuperación.
6. Definir orden, correlación, versión de esquema, retención y política de replay.
7. No desplegar NATS como dependencia productiva de los servicios hasta definir flujos concretos y probar recuperación.
8. Redis no se convierte en requisito de dominio; se justificaría, por ejemplo, para rate limit distribuido o caché medible.

## Reglas de consistencia

- Un retry de comando no debe conceder XP, monedas o tarjeta duplicados.
- Las operaciones entre servicios que puedan fallar parcialmente deben tener compensación o reconciliación explícita.
- La idempotencia se define por operación/identificador de negocio, no solo por UUID de request efímero.
- No usar eventos para ocultar errores del servicio que origina el cambio.
- Los eventos no transportan datos personales que el consumidor no necesite.

## Alternativas consideradas

- Publicar evento después del commit sin outbox: rechazado; existe ventana de pérdida.
- Convertir toda llamada gRPC en evento: rechazado; dificulta consistencia y respuesta al usuario.
- Mantener la secuencia actual sin métricas ni reparación: no es suficiente.
- Introducir Redis/NATS solo porque están en Compose: rechazado; agregar dependencia sin caso de uso no es arquitectura.

## Consecuencias

- El flujo SRS/Gamification requiere un contrato de consistencia y pruebas de fallo parcial.
- Si se usa JetStream, se requieren tests de duplicados, huecos, reentrega, replay, orden y caída del broker.
- La observabilidad debe mostrar evento creado, entregado, reintentado, descartado y reconciliado.
- No se implementa mensajería durante Fase 0.

## Referencias

- [Auditoría de arquitectura](../phase-0/architecture-audit.md)
- [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
