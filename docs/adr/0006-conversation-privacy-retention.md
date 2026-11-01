# ADR-0006 — Privacidad y retención de conversaciones

- Estado: **Proposed**
- Fecha: 2026-11-01
- Fase: 0.3
- Decisores: pendiente de aprobación de producto, seguridad y privacidad.

## Contexto

El tutor conversacional es objetivo del roadmap, pero no está implementado. El futuro flujo podría tratar prompts, mensajes, transcripciones, audio, resúmenes y metadatos enviados a proveedores externos. La arquitectura actual de entrevista/transcripción no define una política integral de retención de conversaciones.

No se debe elegir arbitrariamente una duración de retención ni almacenar datos antes de decidir la finalidad.

## Decisión propuesta

1. Aplicar minimización: recopilar y enviar solo datos necesarios para el turno y el objetivo pedagógico.
2. Separar contenido conversacional, transcripciones, grabaciones, resúmenes y metadatos operativos.
3. Obtener información/consentimiento claro antes de capturar o enviar audio cuando corresponda.
4. Definir política de retención por tipo de dato y finalidad antes de habilitar almacenamiento persistente.
5. Permitir al usuario consultar y solicitar eliminación de conversaciones y activos asociados, con resultado verificable.
6. Definir tratamiento de backups, exportaciones, logs, traces, caches y copias en proveedores.
7. Registrar proveedor/modelo, latencia, coste estimado, tokens/uso informado, códigos de error y correlation ID sin imprimir contenido sensible por defecto.
8. No incluir contraseñas, tokens, claves, datos de pago ni secretos en prompts o telemetría.
9. Documentar regiones, subprocesadores, transferencia a terceros, controles de acceso y cifrado.
10. Aplicar aislamiento por usuario y pruebas de acceso cruzado.

## Decisiones pendientes antes de implementación

- Duración de retención de mensajes, audio, transcripción y resumen.
- Si audio original se persiste o se procesa efímeramente.
- Si se permite usar contenido anonimizado para mejora/model evaluation.
- Cómo se solicita consentimiento y se retira.
- Plazos y semántica de borrado en backups y proveedores externos.
- Requisitos legales aplicables y responsables de la revisión.

## Alternativas consideradas

- Guardar indefinidamente para dar contexto: rechazado por defecto; conserva datos sin límite justificado.
- Guardar solo el último mensaje sin diseñar continuidad: insuficiente para tutor multi-turno y eliminación.
- Enviar el perfil entero al proveedor: rechazado; aplicar mínimo contexto necesario.
- Logs completos para depuración: rechazado como default; preferir metadatos y acceso controlado temporal.

## Consecuencias

- Se requiere inventario de datos y flujos a proveedor antes de crear tablas de conversación.
- Deben existir controles de acceso, retención, eliminación, auditoría y tests.
- La UI de tutor necesita estados claros para consentimiento, grabación y eliminación.
- La duración de retención no queda aprobada por este ADR.

## Referencias

- [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
- [Matriz de trazabilidad](../phase-0/traceability-matrix.md)
