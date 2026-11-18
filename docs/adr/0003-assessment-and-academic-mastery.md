# ADR-0003 — Motor de evaluación y dominio académico

- Estado: **Accepted**
- Fecha: 2026-11-01
- Fase: 0.3
- Decisión de producto: modalidad escrita y modalidad hablada independientes, acordada previamente con el propietario del producto.

## Contexto

El evaluador actual envía texto a AWS Bedrock y produce seis scores: listening, pronunciación, fluidez, vocabulario, conversación y gramática. El prompt solicita inferir pronunciación y fluidez a partir del texto y describe listening como comprensión simulada. El endpoint de evaluación no acepta audio original; el BFF envía respuesta textual. La pregunta de entrevista además se muestra por escrito mientras se reproduce por TTS.

Por tanto, el output actual no constituye una medición válida de pronunciación/fluidez oral ni de comprensión auditiva.

## Decisión

Mantener dos modalidades, con rúbricas y resultados separados:

### Evaluación escrita

- Solo mide evidencia disponible en texto: gramática, vocabulario, organización, relevancia y dimensiones escritas aprobadas por la rúbrica.
- No asigna puntuación de pronunciación ni fluidez oral.
- No presume comprensión auditiva por responder a una pregunta escrita.

### Evaluación hablada

- Requiere la grabación/audio original o una representación acústica equivalente y validada.
- Pronunciación y fluidez oral solo se puntúan con evidencia de audio suficiente.
- La transcripción sirve como evidencia complementaria para vocabulario, gramática y contenido, no como sustituto del audio.
- Si la grabación falta, es ininteligible o no cumple calidad mínima, la métrica se marca como **no medida**, no se inventa una puntuación.

### Listening

- Se medirá en ejercicios específicos donde el estímulo principal sea audio.
- No mostrar transcripción ni pregunta escrita que revele la respuesta antes de que el estudiante responda.
- Validar que el audio, el ítem y la rúbrica tengan correspondencia versionada.

### Dominio académico

- Los resultados alimentan mastery por habilidad/objetivo según evidencia y rúbrica.
- Un score de una entrevista no se convierte automáticamente en nivel CEFR certificado.
- XP, monedas, rachas y logros permanecen separados del dominio académico.

### Sistema Dual de Pronunciación

- Se conserva como recurso de enseñanza y repetición: inglés → guía lenta → audio lento → repetir → guía natural → audio natural → repetir → traducción.
- No es mecanismo de scoring.
- Las guías son aproximaciones pedagógicas para hispanohablantes, no IPA/AFI exacto.

## Alternativas consideradas

- Una sola nota agregada escrita/hablada: rechazada; mezcla evidencia y puede inventar métricas.
- Calcular pronunciación/fluidez desde transcripción: rechazada; elimina información acústica.
- Medir listening con pregunta visible más TTS: rechazada; no aísla comprensión auditiva.
- Quitar el sistema dual: rechazado; es parte central de la metodología del producto.

## Consecuencias

- Contratos y UI deben especificar modalidad y métricas aplicables.
- Los resultados deben incluir evidencia, estado de medición y versión de rúbrica.
- Los fixtures de tests deben separar texto, audio y listening.
- Consentimiento, tratamiento, retención y borrado de audio requieren política de privacidad.
- No se debe conservar la ponderación actual de seis scores como rúbrica válida sin rediseño y calibración.

## Estado de implementación

No implementado. Esta ADR registra la decisión de diseño, no certifica la validez del evaluador actual.

## Referencias

- [Auditoría funcional](../phase-0/functional-inventory.md)
- [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
