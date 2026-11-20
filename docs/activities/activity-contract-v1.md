# Contrato de actividades v1.0

**Estado:** contrato de dominio en implementación para la Subfase 2.1.
**Módulo:** `crates/common/src/activity_contract.rs` (`common::activity_contract`).
**No incluye:** persistencia de actividades/intentos, endpoints, sesión de lección ni UI de ejercicios.

## 1. Separación de datos

Hay tres límites de confianza distintos:

| Contrato | Consumidor | Contiene | No contiene |
|---|---|---|---|
| `ActivityDefinition` | Servicio/backend/editorial | clave correcta, respuestas aceptadas, criterios, rúbrica, pistas, límites | datos de intentos |
| `StudentActivityView` | Frontend estudiante | estímulo, instrucciones, prompt, opciones, tokens, IDs de respuesta, títulos de pistas y límites | clave, respuestas aceptadas, orden correcto, rúbrica y penalizaciones |
| `ActivitySubmission` / `ActivityAttemptResult` | BFF/servicio/cliente | versión exacta, idempotency key, respuesta tipada, pistas usadas, tiempo activo, resultado y estado de medición | cambios al contenido publicado |

La pantalla del estudiante recibe únicamente `StudentActivityView`. No debe devolver `ActivityDefinition` y confiar en que React o CSS oculten campos. La proyección Rust construye una estructura distinta y omite los campos privados desde el origen.

## 2. Identidad, versión y contexto

Toda definición incluye:

- `schemaVersion = "1.0"`: versión del formato serializado.
- `activityId`: identidad estable de la actividad.
- `activityCode`: código estable, minúsculo y apto para referencias.
- `activityVersion`: revisión positiva e inmutable del contenido.
- `courseVersionId` y `lessonId`: contexto académico exacto.
- `objectiveIds` y `skills`: uno o más objetivos/competencias controlados.
- `track`, `cefrLevel` y `modality`: ruta, nivel y evidencia esperada.

Cambiar prompt, claves, opciones, criterio o estímulo después de publicar requiere una nueva versión. Un intento histórico debe conservar la versión que vio el estudiante.

## 3. Tipos del contrato

La unión discriminada `exercise.type` define los siguientes tipos:

| Tipo | Evidencia/respuesta | Datos privados en servidor |
|---|---|---|
| `multiple_choice` | IDs de opciones elegidas | IDs correctos y regla de selección |
| `translation` | texto | respuestas aceptadas y dirección |
| `fill_blank` | valor por gap ID | conjunto aceptado por gap |
| `word_order` | secuencia de token IDs | orden correcto |
| `matching` | pares de IDs | correspondencias correctas |
| `listening_comprehension` | opciones por question ID | claves correctas; audio requerido y transcript no visible antes de responder |
| `dictation` | transcripción escrita | transcripciones aceptadas; audio requerido |
| `reading_comprehension` | opciones por question ID | claves correctas |
| `grammar_transformation` | texto | formas aceptadas |
| `error_correction` | texto | correcciones aceptadas |
| `open_writing` | texto abierto con mínimo/máximo de palabras | rúbrica versionada |
| `guided_dialogue` | referencia a audio cargado y transcripción complementaria opcional | rúbrica versionada; el texto no sustituye el audio |
| `vocabulary_recall` | texto | palabra referenciada y respuestas aceptadas; se usa como práctica no puntuada de dominio |

La existencia del tipo en el contrato no significa que el reproductor, evaluador o persistencia de ese tipo estén terminados. La implementación funcional de los tipos corresponde a Subfase 2.2.

## 4. Modalidades y evidencia

- **written:** respuestas basadas en texto; no puede afirmar que midió speaking o listening.
- **spoken:** diálogo guiado, audio original asociado a un upload ID, duración máxima y rúbrica. La transcripción es evidencia complementaria.
- **listening:** comprensión o dictado cuyo estímulo es audio. No admite mostrar el transcript previamente ni usar una versión text+audio que revele el guion.
- **practice:** recuperación de vocabulario sin score académico; no modifica mastery por sí sola.

Pronunciación y fluidez no se deducen de texto. Si el audio falta, no es válido o no puede medirse, el resultado utiliza `not_measured` y el score es nulo.

## 5. Evaluación y crédito parcial

`EvaluationPolicy` tiene tres variantes:

- `deterministic`: clave cerrada, `maxPoints`, política de crédito parcial (`none`, `per_item`, `proportional`) y normalización de texto explícita.
- `rubric`: código y versión de rúbrica, puntos máximos y criterios con competencia/puntos. La suma de los criterios debe coincidir con `maxPoints`.
- `unscored_practice`: no otorga puntuación académica y solo se permite para modalidad practice.

Los criterios no se exponen en `StudentActivityView`. La regla de scoring debe permanecer en backend y su versión deberá guardarse con el intento cuando se implemente persistencia.

## 6. Límites, pistas y feedback

Los límites se validan en el contrato: entre 1 y 10 intentos, entre 5 y 7200 segundos para tiempo de actividad, hasta 8 pistas y hasta 600 segundos de audio. El servicio de sesiones deberá contar intentos reales de forma transaccional; el campo del contrato no reemplaza esa persistencia.

Cada pista tiene ID, orden, título, cuerpo y penalización. La proyección inicial devuelve solo ID, orden y título. El cuerpo de una pista se entregará en el momento solicitado, tras validar el máximo permitido.

El feedback especifica momento de entrega, explicación y revelación de respuesta correcta posterior al envío. No debe enviar la explicación ni la clave antes de que la política lo permita.

## 7. Envío y resultado

`ActivitySubmission` incluye schema, actividad/versión, clave de idempotencia, respuesta discriminada, IDs de pistas usadas y duración activa. La validación comprueba:

- coincidencia exacta de actividad y versión;
- clave idempotente no nula;
- respuesta compatible con el tipo;
- opciones/tokens/gaps/preguntas pertenecientes a la actividad;
- IDs duplicados, referencias ajenas y límites de longitud/tiempo/audio;
- pistas disponibles y máximo de pistas.

`ActivityAttemptResult` admite:

- `evaluated`: requiere score dentro de `0..maxPoints` y normalización `0..100`.
- `pending_review`: todavía no asigna score final.
- `not_measured`: no inventa score por falta de evidencia.

Cada skill medida requiere un score entre 0 y 100; una skill no medida debe tener score nulo.

## 8. Ejemplo de actividad escrita

Ejemplo reducido de la forma del objeto privado (la clave se omite deliberadamente aquí; en runtime la conserva el backend):

```json
{
  "schemaVersion": "1.0",
  "activityId": "00000000-0000-0000-0000-000000000001",
  "activityCode": "a1-greetings-choice",
  "activityVersion": 1,
  "courseVersionId": "00000000-0000-0000-0000-000000000002",
  "lessonId": "00000000-0000-0000-0000-000000000003",
  "title": "Choose the correct greeting",
  "cefrLevel": "A1",
  "track": "general",
  "modality": "written",
  "skills": ["vocabulary"],
  "objectiveIds": ["00000000-0000-0000-0000-000000000004"],
  "instructions": "Read the prompt and choose one answer.",
  "exercise": {
    "type": "multiple_choice",
    "prompt": "How do you greet someone for the first time?",
    "options": [
      { "optionId": "00000000-0000-0000-0000-000000000010", "text": "Nice to meet you" },
      { "optionId": "00000000-0000-0000-0000-000000000011", "text": "Good night" }
    ],
    "correctOptionIds": ["00000000-0000-0000-0000-000000000010"],
    "allowMultiple": false
  },
  "hints": [],
  "evaluation": {
    "kind": "deterministic",
    "maxPoints": 10,
    "partialCredit": "none",
    "textNormalization": ["trim_whitespace"]
  },
  "feedback": {
    "timing": "after_submission",
    "showExplanation": true,
    "revealCorrectAnswerAfterSubmission": true
  },
  "limits": {
    "timeLimitSeconds": 120,
    "maxAttempts": 2,
    "maxHints": 0,
    "maxAudioDurationSeconds": null
  }
}
```

## 9. Límite de la Subfase 2.1

Este contrato no crea tablas ni guarda intentos. La persistencia de intentos, transacciones, ownership de upload de audio, idempotencia efectiva y recuperación de sesión se implementará en 2.3/2.4. La implementación de los tipos de ejercicio y su UI pertenece a 2.2. El contrato se acepta cuando la CI ejecuta las pruebas unitarias del módulo y el servicio/cliente consumidor puede usar las proyecciones sin filtrar datos privados.
