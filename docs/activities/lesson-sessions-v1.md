# Sesiones de lección v1

**Subfase:** 2.4 — Sesiones de lección  
**Estado:** implementación en revisión; CI y aceptación manual pendientes.

## Objetivo

Ejecutar actividades que pertenecen a una lección curricular publicada con progreso persistente, resultados autoritativos y recuperación idempotente. La sesión nunca acepta definiciones privadas enviadas por el navegador.

## Modelo persistente

- \`curriculum_lesson_activities\`: definición privada versionada, identidad de curso/lección/actividad, posición, objetivos vinculados y SHA-256. Es inmutable después de importarse.
- \`lesson_activity_objectives\`: relación actividad–objetivo, con claves foráneas compuestas para impedir asociaciones a otra lección.
- \`lesson_sessions\`: propietario, matrícula, versión de curso, lección, clave idempotente de inicio, estado, cursor y tiempo activo acotado.
- \`lesson_session_activity_attempts\`: reserva de cada envío, número de intento, clave idempotente por usuario, contenido enviado y resultado final.
- \`activity_objective_evidence\`: evidencia append-only vinculada a una sesión, resultado, actividad y objetivo; guarda score normalizado de 0 a 1.
- \`lesson_completion_reward_events\`: ledger único por usuario/lección para recompensas de finalización.

Las tablas sensibles aplican RLS forzado. Las claves foráneas incluyen identidad del usuario, curso, versión, lección y actividad para que una relación no pueda cruzar tenants o versiones.

## Flujo de ejecución

1. El estudiante autenticado solicita iniciar una lección con una clave idempotente.
2. El servicio comprueba que la versión esté publicada, que exista matrícula activa, que se cumplan prerrequisitos y que haya actividades publicadas.
3. La sesión se crea o se reanuda. Una restricción única evita dos sesiones activas de la misma lección para el mismo usuario.
4. El snapshot interno obtiene la definición y la convierte a \`StudentActivityView\`. El BFF solo entrega esta proyección pública.
5. Para enviar, el backend bloquea la sesión, valida la respuesta contra la definición inmutable y reserva el intento con una clave única.
6. El evaluador existente calcula el resultado determinista o aplica la rúbrica permitida. El motor confirma solo después de verificar la definición, la respuesta y el resultado persistido.
7. En una transacción se cierra la reserva, se agrega evidencia por objetivo y se actualiza el cursor/estado. Si la respuesta puede reintentarse, el cursor permanece en la misma actividad hasta el límite definido.
8. La finalización académica se registra separada de las recompensas. Gamificación valida la evidencia y aplica el ledger idempotente.

## Contrato HTTP del BFF

| Método y ruta | Uso |
|---|---|
| \`POST /api/v1/curriculum/lessons/:lesson_id/sessions\` | Iniciar o reanudar, con \`idempotency_key\` |
| \`GET /api/v1/learning/sessions/:session_id\` | Recuperar estado; también reanuda una reserva que quedó en proceso |
| \`POST /api/v1/learning/sessions/:session_id/answers\` | Enviar una respuesta con identidad de actividad y clave idempotente |

El BFF exige JWT y deriva el usuario de la sesión autenticada. Los errores gRPC se normalizan a códigos HTTP y mensajes genéricos. El cuerpo de una respuesta está limitado a 256 KiB; el inicio usa un límite menor. Las operaciones aplican cuotas por usuario y operación.

## Separación de datos públicos y privados

El navegador solo recibe identidad/versión, consigna, estímulo público, opciones, límites, pistas disponibles y resultado validado. Nunca recibe:

- Respuestas aceptadas, claves correctas o posiciones esperadas.
- Definición privada completa o rúbrica interna.
- Envío privado recuperado desde la reserva.
- Identificadores internos de reserva.

Cada lectura calcula/verifica SHA-256 sobre el JSON almacenado antes de deserializarlo y validar el contrato.

## Recuperación e idempotencia

La sesión es la fuente autoritativa; React solo mantiene el estado de presentación. Las claves de inicio y de envío son únicas por usuario. Repetir la misma clave con el mismo contenido devuelve el intento existente; reutilizarla con contenido distinto devuelve conflicto.

Una reserva en estado \`processing\` conserva la respuesta exacta. Al recuperar la sesión, el BFF reenvía esa misma pareja definición/respuesta al evaluador. La persistencia idempotente del evaluador evita repetir el costo/proveedor y luego se confirma la reserva. El avance no se aplica dos veces.

## Tiempo y límites

El servidor limita la duración total acumulada a 12 horas y no acepta que el cliente declare más tiempo que el transcurrido en servidor más una tolerancia de transporte de 5 segundos. Las pausas del navegador no cuentan como tiempo activo del cliente; los límites de actividad y número de intentos se vuelven a validar en backend.

## Dominio y recompensas

El dominio no se deduce de XP. Solo resultados con puntuación generan evidencia; las métricas no medidas no se convierten en cero. Una lección solo puede quedar marcada como dominada si hay evidencia para todos los objetivos requeridos y su promedio más reciente alcanza el umbral definido. La recompensa de finalización se registra una sola vez por usuario/lección.

## Límites pendientes explícitos

- El resolver autorizado de assets de audio/imagen para los estímulos de actividades aún no está conectado al renderer de sesión. Los IDs nunca deben convertirse en URLs arbitrarias desde el navegador.
- No existe todavía un canal de almacenamiento autenticado y verificable de grabaciones habladas para sesiones curriculares. Por eso el servicio rechaza envíos hablados aunque el cliente invente un UUID; la UI deshabilita la grabación. No se infiere pronunciación/fluidez desde una transcripción.
- El limitador actual es local al proceso BFF. Antes de ejecutar varias réplicas, se debe respaldar con un almacén compartido y atómico (Redis u otro servicio aprobado).
- La prueba manual requiere una actividad real revisada y publicada por una cuenta editorial y una matrícula real. No se publican ejercicios de demostración en producción.

## Validación exigida antes de cerrar la subfase

- CI completo para Rust, frontend, auditorías, shell y migraciones frescas/upgrade.
- Tests SQL de RLS forzado, visibilidad privada, propietario de sesión, inmutabilidad y transiciones.
- Pruebas Rust de importador/contrato y proyección HTTP sin claves privadas.
- Prueba manual con actividad publicada; doble clic, pérdida de conexión, cierre de navegador, reanudación y recompensa repetida.
- Confirmar que cualquier fallo de proveedor no avance el cursor ni duplique el intento.
