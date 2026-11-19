# Subfase 1.4 — Auditoría inicial y limpieza segura del catálogo

## Alcance de esta entrega

Esta entrega inicia la curación de 1.4 con una auditoría reproducible de los tres JSON que existen en el directorio de datos, una eliminación limitada a registros A0 totalmente redundantes y una protección para que las reglas fonéticas experimentales no reescriban el contenido antes de importarlo.

No se considera completada la subfase 1.4. No se crea ni se publica un paquete curricular, no se cambian traducciones ni ejemplos por criterio automático y no se declara validada la calidad lingüística de las aproximaciones fonéticas.

## Fuentes editoriales aplicadas

- **Blueprint curricular 1.1**: dos rutas (Inglés General y English for Technology & Professional Communication), progresión por contexto y utilidad, nivel objetivo, frecuencia/prioridad, registro y ejemplos naturales.
- **Prompt de auditoría fonética**: estructura del vocabulario y reglas explícitas para las guías lentas y naturales.
- **Roadmap profesional**: prohíbe publicar guías fonéticas generadas sin validación de pronunciación y revisión editorial.

## Resultado de la auditoría

| Catálogo | Registros actuales | Lemas únicos | Categorías | Campos fonéticos | Diferencias lenta/natural |
|---|---:|---:|---:|---:|---:|
| A0 | 237 | 227 | 39 | 948 | 104 |
| A1 | 469 | 469 | 53 | 1.876 | 83 |
| Semilla heredada | 8 | 8 | 7 | 32 | 6 |

A0 tenía 322 filas antes de la limpieza. Se retiraron **85 filas completamente duplicadas**. Para comparar duplicados se normalizó únicamente el uso de mayúsculas/minúsculas en los cuatro campos fonéticos; el texto inglés, las traducciones, categorías, nivel, orden de frases y valores fonéticos no se alteraron. Se conservaron todas las variantes que difieren en contenido.

### Duplicados y ambigüedad léxica

- A0 mantiene 10 grupos de lemas repetidos. Nueve pares (por ejemplo, **walk**, **run**, **sleep**, **call**, **cook**, **wash**, **buy**, **pay** y **give**) contienen la misma palabra, categoría, traducción y frases, pero difieren en la anotación de pronunciación natural. Se conservaron para revisión; no se eligió una variante arbitrariamente.
- **clean** conserva dos sentidos: verbo (**limpiar**, categoría **actions_basic**) y adjetivo (**limpio**, categoría **descriptors_basic**). No son duplicados semánticos.
- A0 contiene 59 grupos de frases inglesas repetidas (62 ocurrencias adicionales); A1 contiene 5 grupos (5 ocurrencias adicionales). La misma frase puede servir para practicar varios lemas, así que no se borró automáticamente.
- Se identificaron 96 grupos de traducciones españolas repetidas en A0 y 2 en A1. Casos como **hi/hello → hola**, **bye/goodbye → adiós**, **sofa/couch → sofá** y **talk/speak → hablar** pueden ser sinónimos o equivalencias válidas, no errores por sí mismos.

### Categorías

A0 tiene 39 nombres de categoría y A1 tiene 53. Hay nomenclaturas que parecen representar familias similares con claves diferentes, por ejemplo **animals_basic/animals**, **clothing_basic/clothes**, **body_basic/body/body_parts** y **food_basic/food**. No se normalizaron en esta entrega: antes hay que aprobar una taxonomía controlada y comprobar qué filtros, contratos y contenidos dependen de cada valor.

### Pronunciación

Todos los campos **spanish_phonetic** y **spanish_phonetic_natural** existentes se conservaron y se normalizaron a minúsculas, como exige la guía editorial. Tras esa normalización no quedan campos fonéticos con mayúsculas.

La diferencia entre lenta y natural es intencional en algunos elementos y puede ser legítima en otros. La auditoría cuenta las diferencias, pero **no certifica** que cada enlace, reducción o guía aproximada sea correcta. Deben revisarse especialmente las nueve variantes A0 conservadas y los casos donde la guía introduce un enlace o una reducción no respaldada por el texto inglés.

El script **phonetic_engine.js** aplica transformaciones automáticas más amplias que la lista cerrada del prompt editorial y modifica archivos JSON en el directorio de datos. Quedó protegido por una opción de entorno explícita y dejó de ejecutarse durante **import_vocab.sh**. No debe utilizarse para generar contenido publicable sin revisión lingüística.

## Cambios realizados

1. Se eliminaron 85 registros A0 idénticos tras normalizar solo el casing fonético; permanecen 237 registros y los sentidos diferentes.
2. Se aplicó minúscula a los campos de pronunciación de A0, A1 y la semilla heredada. No se cambiaron palabras inglesas, traducciones ni frases.
3. Se añadió **tools/curriculum/audit_seed_catalog.mjs**, de solo lectura, que informa estructura, duplicados, frases reutilizadas, traducciones repetidas, categorías, campos fonéticos y lemas compartidos entre catálogos.
4. Se añadieron pruebas para el esquema, la eliminación de duplicados exactos, la conservación de los dos sentidos de **clean** y el tratamiento informativo de frases reutilizadas.
5. El CI ejecuta la auditoría estricta. Un cambio exclusivo de JSON de semilla o de scripts de autoría no despliega la aplicación: ejecuta validaciones, no publica ni importa contenido.
6. El importador heredado dejó de ejecutar el motor fonético automáticamente. **import_vocab.sh** sigue deshabilitado por defecto y sigue siendo destructivo; no se debe usar contra producción ni contra bases con progreso de estudiantes.

## Pendientes de 1.4

- Revisar lingüísticamente las variantes fonéticas preservadas y los ejemplos marcados por repetición o naturalidad.
- Aprobar y aplicar una taxonomía común de categorías sin perder contexto.
- Definir metadatos de frecuencia, utilidad, registro, contexto y prioridad por nivel.
- Crear expresiones funcionales, collocations y phrasal verbs como unidades léxicas contextualizadas.
- Completar el contenido general por niveles y la ruta tecnológica por dominios y niveles.
- Añadir lecturas, diálogos y recursos auditivos con dificultad conocida y licencia/fuente registradas.
- Generar fixtures por nivel y tipo de actividad, coordinados con el contrato de actividades de Fase 2.
- Someter cualquier paquete real a validación, autoría y revisión editorial antes de importarlo como draft; la aprobación/publicación es un paso separado de 1.3/1.5.

## Verificación reproducible

Desde la raíz del repositorio:

    node tools/curriculum/audit_seed_catalog.mjs --strict
    node --test tools/curriculum/tests/seed_catalog_audit.test.mjs

La auditoría no se conecta a PostgreSQL ni modifica datos. La limpieza descrita se limita a los archivos fuente de semillas.
