# ADR 0009 — Sesiones curriculares recuperables

- **Estado:** propuesta implementada en la rama \`feat/phase-2-4-learning-sessions\`; pendiente de CI/aceptación.
- **Fecha:** 2026-11-21.
- **Fase:** 2.4 — Sesiones de lección.

## Contexto

Los renderizadores de 2.2 y el evaluador de 2.3 ya existen, pero una actividad publicada todavía necesita una frontera segura de entrega, un estado de sesión persistente, idempotencia ante reintentos y recuperación después de perder el navegador. No se debe enviar al cliente la clave correcta ni permitir que el cliente defina su propia rúbrica o puntuación.

## Decisión

1. Persistir definiciones privadas versionadas en PostgreSQL junto a la lección y sus objetivos, con SHA-256 e inmutabilidad.
2. Mantener el estado de sesión y las reservas de envío en PostgreSQL, protegido por RLS forzado e integridad referencial compuesta.
3. Exponer solo endpoints HTTP autenticados a través del BFF. El evaluador recibe la definición privada únicamente por RPC interno.
4. Reservar antes de evaluar y confirmar el resultado/avance en una transacción posterior. Reutilizar la misma clave idempotente para recuperar un envío que quedó en proceso.
5. Derivar evidencia por objetivo únicamente desde resultados evaluados; mantener separados dominio académico y recompensas.
6. Registrar recompensas de finalización en un ledger idempotente en el servicio de gamificación.
7. Reutilizar \`ai-evaluator-service\`, BFF, PostgreSQL y renderer existentes; no crear un nuevo microservicio.
8. Denegar una respuesta hablada cuando no existe un archivo de audio emitido por un canal de almacenamiento autenticado y verificable. No inferir métricas acústicas desde texto.
9. Aplicar límites de tasa por usuario en el BFF actual, documentando que el limitador local debe migrar a un contador compartido antes de desplegar varias réplicas.

## Consecuencias

**Positivas**
- El servidor es la fuente de verdad del progreso y resultado.
- Una desconexión entre reserva, proveedor y confirmación se puede recuperar sin duplicar intentos.
- Las claves privadas no salen del backend.
- Los eventos académicos y recompensas son idempotentes y auditables.
- La base de datos impide cruzar la identidad de la sesión, la matrícula, el contenido y los objetivos.

**Costos y límites**
- La migración añade varias tablas e índices; se deben observar las consultas de sesiones y evidencia.
- El BFF está limitado por proceso en esta entrega; horizontalizar requiere limitador compartido.
- El almacenamiento/resolución de assets y la subida de audio hablado quedan como integración pendiente explícita.
- La aceptación manual requiere contenido real publicado, no fixtures sembrados en el entorno personal.

## Rechazado

- Guardar el avance únicamente en React, localStorage o sessionStorage.
- Exponer \`ActivityDefinition\` al navegador.
- Confiar en el score devuelto por el frontend.
- Reutilizar STT como evaluación acústica.
- Acreditar XP directamente desde el cliente.
- Añadir un microservicio o secretos de infraestructura sin justificación.
