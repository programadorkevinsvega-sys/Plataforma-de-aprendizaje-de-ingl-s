# Renderizadores de ejercicios v1

**Subfase:** 2.2 — Motor de lecciones y ejercicios  
**Estado:** implementación de renderizadores y contrato cliente en rama; CI pendiente. La entrega de actividades y persistencia de intentos sigue en 2.3–2.4.

## Componentes

- Dominio y validación de proyección/respuesta/resultado: `frontend/src/domain/entities/Activity.ts`.
- Reproductor reutilizable: `frontend/src/presentation/components/activities/ActivityExerciseRenderer.tsx`.
- Pruebas de contrato: `frontend/tests/phase2/activity.test.mjs`.
- Comando: `pnpm --filter devfluency-node-workspace test:frontend:phase2`.

## Familias soportadas

| Tipo | Interacción que produce |
|---|---|
| `multiple_choice` | Uno o varios IDs de opción |
| `translation` | Texto libre inglés→español o español→inglés |
| `fill_blank` | Valor por identificador de espacio |
| `word_order` | Secuencia de identificadores de token |
| `matching` | Pares de IDs izquierda/derecha sin reutilizar elementos |
| `listening_comprehension` | Respuestas por pregunta; audio sin transcripción previa |
| `dictation` | Transcripción escrita |
| `reading_comprehension` | Respuestas por pregunta asociadas al texto |
| `grammar_transformation` | Oración transformada |
| `error_correction` | Oración corregida |
| `open_writing` | Texto dentro de límites de palabras/caracteres |
| `guided_dialogue` | Audio grabado por el estudiante con carga autenticada inyectada |
| `vocabulary_recall` | Recuperación textual vinculada a un término |

## Contrato del host

El padre consume una `StudentActivityView` validada y conecta:

- `onSubmit(submission)`: entrega la `ActivitySubmission` versionada al servicio de sesión. Si devuelve `ActivityAttemptResult`, el reproductor valida y muestra el resultado. Nunca califica en el navegador.
- `resolveAudioUrl(assetId)`: resuelve audio autorizado; no se construyen URLs desde IDs.
- `resolveImageUrl(assetId)`: resuelve imágenes autorizadas.
- `uploadSpokenAudio(blob, durationMs)`: carga autenticada y controlada de audio, con propiedad y límites verificados por backend.

El cliente controla interacción y completitud para evitar envíos accidentales. El servidor vuelve a validar todo. El cliente no tiene claves correctas, respuestas aceptadas, orden correcto, rúbricas ni criterios internos.

## Estados de resultado

- `evaluated`: muestra puntuación validada y el feedback permitido por la política.
- `pending_review`: confirma que la entrega está pendiente, sin mostrar puntuación.
- `not_measured`: indica que no se pudo medir; no inventa puntuaciones.

Los errores de transporte se muestran como error de envío y permiten reintentar. La clave idempotente se crea para cada acción de envío; el backend deberá aplicar deduplicación transaccional.

## Límites intencionados

Esta entrega no inventa contenido, no publica ejercicios de demostración y no añade un endpoint que devuelva actividades inexistentes. La integración de actividades reales desde las lecciones publicadas, el almacenamiento idempotente de intentos y la recuperación de sesiones pertenecen a 2.3–2.4. La evaluación autoritativa se mantiene en backend y el feedback pedagógico contextual se desarrolla en 2.5.
