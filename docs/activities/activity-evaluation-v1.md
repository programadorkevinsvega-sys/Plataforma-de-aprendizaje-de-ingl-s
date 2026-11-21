# Evaluación de actividades versionadas — v1

## Alcance

La evaluación vive en common::activity_evaluation y se expone mediante el RPC interno EvaluateLearningActivity de ai-evaluator-service. No se crea otro microservicio ni se publican claves de respuesta al navegador.

El RPC recibe una definición privada validada y el envío del estudiante. En 2.4, el BFF obtiene esa definición del contenido publicado y conecta el motor de sesión con este RPC. No se debe exponer un endpoint público que acepte ActivityDefinition enviada por el estudiante: contiene las respuestas aceptadas y la rúbrica privada.

## Evaluación determinista

Las respuestas cerradas se corrigen con las respuestas y equivalencias que forman parte de la versión publicada. Se admiten selección múltiple, traducción, completar espacios, orden de palabras, relacionar, listening comprehension, dictado, reading comprehension, transformación gramatical y corrección de errores.

Las normalizaciones son explícitas y ordenadas en EvaluationPolicy::Deterministic:

- trim_whitespace: elimina espacios al principio y al final.
- collapse_whitespace: convierte secuencias de espacios en un solo espacio.
- case_insensitive: compara sin distinguir mayúsculas y minúsculas.
- normalize_punctuation: elimina puntuación ASCII.
- unicode_nfc: normaliza Unicode a NFC.

No hay similitud difusa, distancia de edición ni aceptación generativa en actividades cerradas. Una equivalencia adicional debe formar parte de acceptedAnswers de esa versión. El crédito parcial usa none, per_item o proportional; el descuento por pistas usa los valores de la definición privada y no puede producir una puntuación negativa.

## Respuestas abiertas y salida IA

open_writing utiliza una rúbrica versionada. El modelo recibe el nivel, la consigna, la respuesta escrita y los criterios de esa rúbrica. La respuesta del estudiante se trata como datos, no como instrucciones.

La salida del proveedor debe ajustarse a RubricEvaluationOutput: identidad y versión exactas de rúbrica, cada criterio exactamente una vez, puntos enteros dentro del máximo y comentarios acotados. Se rechaza cualquier criterio inventado, omitido, duplicado o fuera de rango. La puntuación final se calcula en Rust a partir de los puntos validados, no se acepta un total arbitrario del modelo. La explicación se devuelve solo cuando la política de feedback de la actividad lo permite.

## Modalidades habladas y práctica

Una transcripción no demuestra pronunciación ni fluidez acústica. Las respuestas spoken se guardan como pending_review, sin puntuación y con métricas not_measured, hasta que exista evaluación basada en evidencia acústica verificable. El evaluador de rúbricas rechaza explícitamente actividades orales aunque se proporcione texto.

La recuperación de vocabulario (practice) sigue siendo no puntuada académicamente: genera not_measured, no una nota de dominio.

## Persistencia, RLS e idempotencia

activity_attempt_results guarda la definición privada exacta, el envío, el resultado, la versión del motor y la identidad/versión de la rúbrica cuando aplica. La tabla fuerza RLS con políticas de lectura e inserción por app.current_user_id; no hay políticas de actualización o eliminación.

La clave idempotente es única por usuario. Un reintento con la misma clave y el mismo contenido devuelve el primer resultado confirmado; reutilizar la clave con otra actividad o respuesta produce conflicto. El ID del intento es independiente de la clave idempotente. La contabilización transaccional de progreso y recompensas, así como el límite de intentos por actividad, se aplican desde el motor de sesiones en 2.4.

## Errores

- Definición, respuesta o combinación inválida: INVALID_ARGUMENT.
- Versión de contrato o actividad incompatible: FAILED_PRECONDITION.
- Clave idempotente usada con otro contenido: ALREADY_EXISTS.
- Límite de tamaño: RESOURCE_EXHAUSTED.
- Proveedor o timeout: UNAVAILABLE.
- Fallo de persistencia o consistencia interna: INTERNAL/UNAVAILABLE, con detalles técnicos solo en logs.

Las respuestas de error no incluyen claves ni rúbricas privadas.

## Límites pendientes

- La fuente autoritativa para recuperar definiciones de actividades de una lección publicada y la ruta HTTP pública de envío pertenecen a 2.4.
- La evaluación acústica real de pronunciación y fluidez requiere el flujo de evidencia de audio y la calibración académica posterior; hasta entonces el estado es pending_review.
- La prueba manual con contenido publicado y proveedor real queda pendiente de la integración de 2.4.
