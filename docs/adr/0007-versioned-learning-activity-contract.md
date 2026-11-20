# ADR-0007 — Contrato versionado de actividades y separación de evidencia

- Estado: **Accepted**
- Fecha: 2026-11-20
- Fase: 2.1 — Contrato de actividad
- Alcance: contrato de dominio; no introduce persistencia ni un servicio desplegable.

## Contexto

El modelo curricular ya contiene cursos, versiones, lecciones, objetivos y competencias, pero todavía no existe una actividad ejecutable versionada. El evaluador legado de entrevistas mezcla métricas de listening, pronunciación, fluidez, vocabulario, gramática y conversación a partir de una respuesta textual. Esa respuesta no aporta evidencia acústica para afirmar pronunciación o fluidez, ni demuestra comprensión auditiva.

ADR-0003 ya aprobó modalidades escrita y hablada independientes. La Fase 2 necesita un contrato reutilizable para actividades cerradas, abiertas, de lectura, escucha y diálogo, sin enviar claves de respuesta al estudiante.

## Decisión

1. Definir una actividad como una versión inmutable asociada a un `course_version_id`, una lección y uno o más objetivos curriculares. Cada definición incluye `schema_version` y `activity_version`.
2. Mantener la definición privada del servidor separada de `StudentActivityView`. La vista pública no contiene claves, respuestas aceptadas, orden correcto, rúbricas, criterios privados, penalizaciones ni texto de pistas no solicitadas.
3. Usar una unión discriminada por tipo de ejercicio. Los tipos de la primera versión del contrato son selección múltiple, traducción, completar espacios, ordenar palabras, relacionar, comprensión auditiva, dictado, comprensión lectora, transformación gramatical, corrección de errores, escritura abierta, diálogo guiado y recuperación de vocabulario.
4. Separar modalidad `written`, `spoken`, `listening` y `practice`. Una actividad `spoken` requiere respuesta acústica y rúbrica; una respuesta sin audio medible no recibe puntuación de pronunciación/fluidez. Una actividad `listening` requiere un asset de audio y no puede revelar transcripción antes de responder.
5. Permitir evaluación determinista para respuestas cerradas, rúbrica versionada para producción abierta y práctica no puntuada para recuperación SRS. El crédito parcial es explícito: `none`, `per_item` o `proportional`.
6. Definir límites explícitos para tiempo, intentos, pistas y duración del audio. La persistencia/contabilización de intentos será responsabilidad de las subfases 2.3 y 2.4; el contrato no permite inferir el número de intentos sin un registro persistido.
7. Cada envío referencia actividad y versión exactas, incluye clave de idempotencia, tipo de respuesta, pistas usadas y tiempo activo. El backend valida que los IDs de opciones/objetivos pertenecen a esa versión y que la respuesta corresponde al tipo de ejercicio.
8. Cada resultado diferencia `evaluated`, `pending_review` y `not_measured`. Una competencia `not_measured` siempre tiene score nulo; nunca se sustituye la falta de evidencia por una puntuación sintética.
9. No crear un microservicio. El contrato está en el módulo Rust compartido `common::activity_contract`, independiente de HTTP, gRPC y PostgreSQL.

## Alternativas consideradas

- Reutilizar el JSON de preguntas de Reading/Listening como contrato universal: rechazado; no cubre respuestas, evaluación, pistas, límites ni modalidades productivas.
- Enviar definiciones completas al navegador y ocultar la clave en React: rechazado; la clave y rúbrica quedarían expuestas en la respuesta de red.
- Usar un `answer: JSON` sin unión discriminada ni validación por tipo: rechazado; no evita respuestas inválidas ni opciones ajenas a la actividad.
- Evaluar pronunciación desde transcripción: rechazado por falta de evidencia acústica.
- Crear un microservicio Activities antes de tener persistencia y carga demostradas: rechazado; el dominio se implementa como módulo compartido.

## Consecuencias

- Las definiciones publicadas deberán versionarse; editar una actividad crea otra versión y no cambia intentos históricos.
- La API pública de actividad debe construir explícitamente la proyección segura; nunca serializar `ActivityDefinition` directamente a estudiantes.
- Las preguntas de Listening deben ocultar transcript, respuesta correcta y explicación hasta el momento autorizado por la política.
- Los evaluadores deterministas deben ser reglas explícitas y versionadas; IA solo se usa donde la rúbrica permita una evaluación abierta controlada.
- El registro de respuestas, idempotencia, puntuación y recuperación se implementará en 2.3/2.4 con transacciones y aislamiento RLS.

## Implementación y límites

La primera implementación se encuentra en `crates/common/src/activity_contract.rs`. Incluye modelos serializables, validación de definición, proyección pública, validación de envíos y resultados, además de pruebas unitarias. No crea tablas, endpoints, sesiones, intentos persistidos ni interfaz de ejercicios; esos entregables pertenecen a subfases posteriores.

## Referencias

- [ADR-0001 — Modelo curricular](0001-curriculum-and-content-model.md)
- [ADR-0002 — Dominio del aprendizaje](0002-learning-domain-model.md)
- [ADR-0003 — Evaluación y dominio académico](0003-assessment-and-academic-mastery.md)
- [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
