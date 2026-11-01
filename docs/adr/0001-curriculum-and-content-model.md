# ADR-0001 — Modelo curricular y catálogo de contenidos

- Estado: **Proposed**
- Fecha: 2026-11-01
- Fase: 0.3
- Decisores: pendiente de aprobación del propietario del producto y arquitectura.

## Contexto

El catálogo actual consulta `vocabulary_words`, `context_sentences` y preguntas de entrevista. La ruta de lección del día es un DTO ensamblado con valores fijos; no existe persistencia de cursos, versiones, unidades, objetivos o lecciones académicas. Los archivos JSON contienen 322 entradas A0 y 469 A1 con tres frases cada una, pero su importación efectiva a PostgreSQL no está demostrada. La semilla SQL inicial contiene seis palabras.

El producto necesita inglés general y una ruta profesional/tecnológica, con objetivos progresivos compatibles con CEFR/MCER.

## Decisión propuesta

1. Mantener dos rutas curriculares relacionadas: inglés general e inglés profesional/tecnológico.
2. Modelar niveles Pre-A1/A0, A1, A2, B1, B2 y C1; C2 será una extensión avanzada con criterios propios, no una etiqueta automática.
3. Organizar contenido en Course → CourseVersion → Unit → Lesson → LearningObjective → Activity/ExerciseItem.
4. El contenido publicado tendrá versiones inmutables. Editar un curso no debe cambiar retrospectivamente el contenido o significado de intentos históricos.
5. Una actividad referencia contenidos reutilizables (vocabulario, frases, audio, imagen, explicación) y especifica nivel, objetivos, instrucciones y criterios.
6. Las rutas general y tecnológica pueden compartir fundamentos, vocabulario y actividades cuando corresponda, sin sustituir la formación general por contenido de tecnología.
7. El Sistema Dual de Pronunciación será recurso pedagógico asociado al contenido: texto inglés, guía aproximada lenta/natural y audio correspondiente. No se debe presentar la guía como IPA/AFI exacta ni como evaluación.
8. El material de origen se importa mediante proceso reproducible/validado, con conteos, duplicados, integridad de referencias y revisión editorial.

## Alternativas consideradas

- Mantener únicamente listas de vocabulario y ampliar etiquetas: no representa objetivos, progresión y versiones de cursos.
- Crear un servicio desplegable por cada entidad curricular: añade complejidad sin justificar límites de despliegue.
- Almacenar toda la estructura en JSON sin versionado ni restricciones: dificulta trazabilidad, consultas, integridad y migraciones.

## Consecuencias

- Antes de migrar, definir un modelo lógico y su correspondencia con tablas/índices.
- Se requieren importación idempotente, versionado, validación de contenido y fixtures.
- No crear una tabla por cada nombre de dominio por defecto; normalizar según relaciones y consultas.
- No se deben tratar los 791 registros JSON como datos disponibles hasta validar el importador y la base objetivo.

## Plan de migración

Fuera del alcance de Fase 0. Después del gate:

1. Auditar el formato de datos y licencias/origen de contenido.
2. Aprobar el modelo lógico y claves de versionado.
3. Diseñar migraciones aditivas y un importador repetible.
4. Importar en staging y reconciliar conteos/duplicados.
5. Ejecutar tests de lectura, aislamiento, rollback y compatibilidad.
6. Publicar versión curricular solo con revisión editorial.

## Referencias

- [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
- [Auditoría funcional](../phase-0/functional-inventory.md)
