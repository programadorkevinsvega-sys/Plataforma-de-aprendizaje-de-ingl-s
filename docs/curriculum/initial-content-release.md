# Carga inicial de Inglés General y catálogo de contenido

Esta release incorpora la importación curricular al despliegue automatizado. Las migraciones PostgreSQL, la carga idempotente, la generación de audio y la publicación del primer curso se ejecutan desde el mismo release de CI/CD.

## Catálogo completo y publicación piloto

La fuente canónica `crates/content-vocabulary-service/data/lexical_catalog.v2.json` contiene 790 entradas léxicas, 2.201 ejemplos y 26 recursos de comprensión (13 Reading y 13 Listening). El pipeline importa el catálogo completo, pero la publicación inicial está limitada a lo que realmente consume English General v1 en Pre-A1 y A1.

| Contenido | Importado | Publicado en el piloto |
|---|---:|---:|
| Entradas léxicas | 790 | 30 |
| Ejemplos contextuales | 2.201 | 26 |
| Recursos Reading/Listening | 26 | 4 |
| Preguntas | 56 | 12 |
| Audios Listening | — | 2 |

Los 760 términos restantes, 2.175 ejemplos y 22 recursos permanecen en borrador y no son visibles para estudiantes. También permanecen ocultos los niveles A2–C2 y el contenido de la ruta Technology, salvo las referencias exactas que pertenezcan al alcance explícito del curso inicial.

Los cuatro recursos originales del piloto son:
- Pre-A1 Reading: **A new English class**
- Pre-A1 Listening: **Your first English class**
- A1 Reading: **Mateo's working day**
- A1 Listening: **Checking in at a hotel**

Los dos paquetes `english-general` incluyen 3 unidades, 5 lecciones y 5 objetivos medibles por nivel (6 unidades, 10 lecciones y 10 objetivos en total). La importación mantiene las referencias de vocabulario y ejemplos vinculadas por nivel CEFR y categoría.

## Revisión del contenido y límites del piloto

El pipeline aplica una revisión asistida por IA y comprobaciones deterministas solamente a los 30 términos y 26 ejemplos referenciados por los dos paquetes iniciales, y a los cuatro recursos de comprensión con sus 12 preguntas. Se comprueban correspondencia de nivel, naturalidad básica, opciones correctas y evidencia textual. La procedencia de esa revisión queda registrada en el catálogo y en PostgreSQL.

Esto habilita un **piloto privado para validación personal**, no una certificación editorial de producción:
- Las guías fonéticas en español son aproximaciones didácticas, no transcripción IPA.
- Las notas de articulación de /θ/ siguen requiriendo validación especializada.
- No se afirma que un hablante nativo o docente haya revisado el material.
- Los dos audios se generan con el proveedor TTS configurado, pero deben escucharse y aprobarse manualmente antes de un lanzamiento público.
- Las condiciones/licencia del proveedor TTS deben revisarse por separado.

Todo el contenido no referenciado por English General v1 queda pendiente y oculto; no se aprueba por el mero hecho de estar importado.

## Ejecución automática en producción

`deploy/deploy-release.sh` ejecuta el siguiente orden:

1. Aplica todas las migraciones SQL en `aprendizaje_ingles`.
2. Combina el catálogo v2 con los cuatro recursos iniciales y aplica el manifiesto de revisión limitado al curso inicial.
3. Importa de forma transaccional e idempotente las 790 entradas, 2.201 ejemplos y 26 recursos como contenido de catálogo.
4. Importa los dos paquetes de curso English General v1 (Pre-A1 y A1).
5. Genera únicamente los dos MP3 Listening iniciales con el proveedor configurado en `phonetic-audio-service.env`.
6. Comprueba el manifiesto, los hashes SHA-256, la cabecera MP3 y el guion fuente; almacena los audios bajo `/var/lib/devfluency/listening-audio/releases/<catalog-sha256>`.
7. Enlaza cada release de frontend a su propio directorio de audio, para que un rollback restaure también los recursos multimedia correspondientes.
8. Reinicia los servicios, comprueba HTTP de la aplicación y verifica que ambos MP3 son accesibles por la ruta pública.
9. Publica en una única transacción únicamente los 30 términos, 26 ejemplos, cuatro recursos, 12 preguntas y dos audios del alcance inicial, y las dos versiones de curso.
10. Verifica los conteos publicados y que el resto del catálogo continúa oculto.

La publicación sucede después de las migraciones, la generación y la comprobación HTTP de los recursos. Si falla una importación, una transición editorial, la validación de un audio, una comprobación HTTP o la publicación, el despliegue falla y revierte la versión de aplicación; los registros no publicados permanecen como borradores.

## Identidad editorial y seguridad

El pipeline usa `CURRICULUM_EDITOR_USER_ID` desde `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env` cuando está configurado. Si no está definido, crea/resuelve una identidad de servicio dedicada y la registra como editor curricular. Esa identidad técnica no tiene una contraseña de usuario utilizable; solo firma la operación automatizada dentro del permiso de editor.

## Re-ejecución

La carga es idempotente:
- Los catálogos y audios se identifican por hash SHA-256.
- Los paquetes de curso se identifican por su hash canónico.
- Los audios no se vuelven a sintetizar si el manifiesto corresponde al hash del release y todos los MP3 superan las comprobaciones.
- Los registros publicados no se reescriben; una modificación posterior requiere una nueva versión revisada.

No se ejecuta ninguna carga desde el frontend ni se exponen los importadores administrativos como endpoints públicos.
