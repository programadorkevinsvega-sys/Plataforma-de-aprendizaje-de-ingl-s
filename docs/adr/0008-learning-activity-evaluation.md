# ADR-0008 — Evaluación de actividades versionadas

- Estado: Accepted
- Fecha: 2026-11-20
- Fase: 2.3 — Evaluación de respuestas

## Contexto

La Subfase 2.2 ya define 13 familias de ejercicios, envíos tipados y resultados autoritativos. El backend todavía no corregía las respuestas de esas actividades ni persistía resultados con idempotencia. El evaluador heredado de entrevistas no debe utilizarse como evaluador genérico de actividades: mezcla modalidades y no puede inferir pronunciación o fluidez desde texto.

## Decisión

1. Implementar common::activity_evaluation como motor de dominio para corrección determinista y validación de resultados de rúbricas.
2. Mantener la evaluación determinista independiente de proveedores: solo se aplican equivalencias publicadas y normalizaciones configuradas por versión.
3. Usar Bedrock únicamente para rúbricas de open_writing en esta entrega. Validar la respuesta contra un esquema tipado y calcular el puntaje final en Rust con criterios y límites inmutables.
4. No puntuar pronunciación ni fluidez desde una transcripción. Las actividades habladas se registran como pending_review hasta que exista evaluación con evidencia acústica; la práctica SRS no genera nota académica.
5. Persistir definición privada, envío y resultado en activity_attempt_results. La clave idempotente es única por usuario y el identificador de intento es independiente de ella.
6. Aplicar PostgreSQL RLS con app.current_user_id; las filas son inmutables desde la aplicación. No agregar un microservicio ni una API pública que acepte claves de respuesta.
7. Exponer el evaluador mediante un RPC interno del ai-evaluator-service. La recuperación segura de actividades publicadas y el endpoint de envío se conectarán desde el motor de sesiones de 2.4.

## Alternativas consideradas

- Usar coincidencia difusa para respuestas cerradas: rechazado porque puede aceptar errores que no están explícitamente permitidos.
- Delegar al LLM el puntaje total sin validar criterios: rechazado porque la salida podría omitir o cambiar la rúbrica.
- Calificar pronunciación desde STT: rechazado por falta de evidencia acústica.
- Enviar definiciones con claves privadas al frontend: rechazado por exponer respuestas y rúbricas.
- Crear un microservicio de evaluación independiente: rechazado; el servicio existente y el módulo compartido cubren la necesidad.

## Consecuencias

- Las actividades cerradas producen resultados reproducibles con reglas versionadas.
- Las rúbricas se pueden cambiar solo publicando una nueva versión de actividad/rúbrica.
- Un reintento con la misma clave devuelve el resultado persistido y no crea otra fila de evaluación.
- Progreso, límite de intentos y recompensas todavía no se acreditan desde este RPC; se integrarán transaccionalmente con el motor de sesiones en 2.4.
- La integración HTTP de actividades publicadas y las pruebas manuales del flujo real quedan pendientes.


## Extensión de la decisión — Subfase 2.5: feedback educativo

La definición privada y versionada de cada actividad puede incluir explicaciones breves diferenciadas para respuestas correctas e incorrectas, una explicación ampliada, ejemplos equivalentes revisados y un código estable de patrón de error con su orientación de refuerzo. Estos campos son opcionales para mantener la lectura de paquetes históricos; el importador valida sus límites antes de publicar una nueva versión.

Las pistas continúan dentro de la definición privada. El estudiante recibe únicamente la siguiente pista solicitada, después de una llamada autenticada y secuencial vinculada a su sesión activa. Cada revelación queda registrada de forma inmutable, junto con el texto servido y la penalización publicada. Al enviar una respuesta, el evaluador compara los IDs declarados con los IDs realmente revelados; el navegador no determina la penalización.

Los patrones de error se registran únicamente para intentos evaluados e incorrectos. El historial guarda el código editorial y la referencia al intento, nunca el texto de la respuesta. La recurrencia se calcula por estudiante y código durante una ventana móvil de 90 días; tres o más eventos permiten mostrar una recomendación de refuerzo. Los eventos son inmutables para la aplicación, están protegidos por RLS y se eliminan mediante las cascadas de la sesión/cuenta según la política de retención.

La proyección pública de la actividad no incluye FeedbackPolicy, claves de respuesta, criterios de rúbrica, penalizaciones ni cuerpos de pistas no desbloqueadas. El resultado evaluado contiene solo el feedback autorizado para el estudiante. Las explicaciones editoriales son deterministas; no se invoca un modelo generativo para corregir ejercicios cerrados.
