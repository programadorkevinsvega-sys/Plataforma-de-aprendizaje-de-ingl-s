# ADR-0002 — Dominio del aprendizaje y progreso

- Estado: **Proposed**
- Fecha: 2026-11-01
- Fase: 0.3
- Decisores: pendiente de aprobación.

## Contexto

El estado actual mezcla catálogo de vocabulario, lección del día derivada, progreso de gamificación y SRS. XP/racha/número de palabras no representan el nivel académico por competencia. No hay tablas o contratos para inscripción a cursos, avance de lección, intentos de actividad ni dominio académico.

## Decisión propuesta

Separar cuatro conceptos que hoy aparecen parcialmente mezclados:

1. **Contenido publicado:** curso/versiones, unidades, lecciones, objetivos, habilidades, actividades y recursos.
2. **Actividad del estudiante:** inscripción, progreso por lección, intentos, respuesta, retroalimentación, ayudas utilizadas, duración y evidencia.
3. **Dominio académico:** estimación por estudiante, habilidad y objetivo, sustentada por intentos válidos y reglas de actualización explicables.
4. **Motivación:** XP, monedas, racha, misiones y logros, sin convertirlos en medida de dominio CEFR.

Conceptos de dominio a evaluar en el modelo:

- CourseEnrollment y CourseVersion.
- LessonProgress y ExerciseAttempt.
- LearnerSkillMastery por habilidad/objetivo.
- LearnerProfile y LearningPlan.
- LearningPlanItem con motivo explicable.
- SrsCard/SrsReview.
- Achievement/UserAchievement y DailyGoal/DailyActivity.
- LearningEvent.

No se crea necesariamente una tabla por cada término. Se diseñará esquema normalizado a partir de límites, cardinalidad, invariantes y consultas.

## Invariantes propuestos

- Un intento referencia una versión concreta de actividad/contenido.
- Un resultado académico incluye evidencia, rúbrica/versión y fecha de evaluación.
- Un evento idempotente no acredita dos veces la misma operación.
- Un usuario no puede leer ni modificar el progreso de otro.
- Recompensas y dominio académico se calculan y consultan por separado.
- Cambiar contenido publicado no reescribe intentos históricos.
- Recomendaciones guardan una razón auditable, no solo un orden de actividades.

## Alternativas consideradas

- Reutilizar `user_stats.current_level` y XP como CEFR: rechazado; XP mide recompensa/actividad.
- Guardar todo el progreso en una fila de usuario: insuficiente para trazabilidad y analítica por competencia.
- Crear microservicio nuevo antes de conocer límites de dominio: prematuro; se priorizan módulos bien separados dentro de servicios existentes.

## Consecuencias

- Requiere modelo de eventos/attempts y reglas de mastery antes de mostrar “nivel real”.
- Las migraciones deberán considerar RLS por usuario y tests de acceso cruzado.
- El recomendador definitivo depende de datos fiables de dominio, por lo que no debe adelantarse a la evaluación.
- Los datos actuales de SRS y gamificación deben migrarse/compatibilizarse, no perderse.

## Referencias

- [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
- [Matriz de trazabilidad](../phase-0/traceability-matrix.md)
