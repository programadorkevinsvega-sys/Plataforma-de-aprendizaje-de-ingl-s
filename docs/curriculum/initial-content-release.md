# Carga inicial de Inglés General y catálogo de contenido

Esta release conecta el catálogo de contenido con el despliegue de la aplicación. La importación y publicación ya no son pasos manuales independientes: forman parte del mismo pipeline de producción, después de aplicar las migraciones PostgreSQL.

## Contenido incluido

La fuente canónica \`crates/content-vocabulary-service/data/lexical_catalog.v2.json\` contiene:

| Tipo | Cantidad |
|---|---:|
| Entradas léxicas | 790 |
| Ejemplos | 2.201 |
| Recursos Reading y Listening | 26 |
| Preguntas de comprensión | 52 |
| Guiones Listening | 13 |

El paquete de comprensión reemplaza cuatro recursos iniciales de Inglés General con contenido original:
- Pre-A1 Reading: **A new English class**
- Pre-A1 Listening: **Your first English class**
- A1 Reading: **Mateo's working day**
- A1 Listening: **Checking in at a hotel**

Los dos paquetes curriculares \`english-general\` tienen 3 unidades cada uno, 5 lecciones cada uno y 5 objetivos medibles por nivel. Las referencias se resuelven contra el catálogo v2 por nivel CEFR y track.

## Ejecución automática en producción

\`deploy/deploy-release.sh\` ejecuta el siguiente orden dentro del despliegue:

1. Aplica todas las migraciones SQL en \`aprendizaje_ingles\`.
2. Combina el catálogo v2 con los cuatro recursos originales y valida su hash.
3. Genera los 13 MP3 Listening mediante el proveedor configurado en \`phonetic-audio-service.env\`, si el hash de catálogo aún no tiene un release de audio.
4. Comprueba el manifiesto, el formato MP3 y el SHA-256 de cada audio.
5. Conserva los audios en \`/var/lib/devfluency/listening-audio/releases/<catalog-sha256>\` y los expone en \`/audio/listening/\` mediante el directorio público de Next.js.
6. Importa de forma transaccional e idempotente las 790 entradas, 2.201 ejemplos, 26 recursos de comprensión y los dos paquetes de curso.
7. Registra la aprobación del propietario del producto mediante un editor curricular registrado y publica vocabulario, ejemplos, lecturas, preguntas, escuchas y versiones de curso. Los cambios de estado editorial se realizan en una única transacción.
8. Verifica los conteos publicados y comprueba por HTTP que los 13 audios se sirven desde el frontend.

La carga se ejecuta después de las migraciones, cuando la nueva versión de la aplicación ya está activa y se han comprobado por HTTP todos los MP3. Solo entonces se realiza la publicación final. Si falla una importación, una transición editorial, la validación de un audio, una comprobación HTTP o la publicación, el despliegue falla y revierte la versión de aplicación; las importaciones incompletas permanecen ocultas como borradores.

## Identidad editorial

El pipeline usa \`CURRICULUM_EDITOR_USER_ID\` desde \`/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env\` cuando está configurado. Si no está definido, resuelve automáticamente el único registro de \`public.content_editors\`. Si no hay exactamente un editor disponible, el despliegue falla sin elegir una identidad arbitraria.

## Pronunciación y audios

La publicación respeta los datos que realmente existen en el catálogo:
- Las entradas léxicas no tienen todavía guías de pronunciación individuales; se publican con \`pronunciation_status = not_required\` en vez de fabricar guías.
- Los ejemplos que tienen candidatos con guías lenta y natural usan el primer candidato disponible; los ejemplos sin guía quedan marcados \`not_required\`.
- Los 13 audios Listening se sintetizan con el proveedor configurado, se validan por formato y hash y se publican con URL relativa permanente. La transcripción sigue oculta (\`transcript_available = false\`).

El manifiesto conserva la información del proveedor y el estado de revisión de licencia. La verificación automática demuestra que los MP3 existen, coinciden con sus hashes y se sirven por HTTP; no sustituye una escucha humana subjetiva ni una auditoría de términos del proveedor.

## Re-ejecución

La carga es idempotente:
- Los catálogos se identifican por hash SHA-256.
- Los paquetes de curso se identifican por su hash canónico.
- Los audios se conservan por hash del catálogo y no se vuelven a sintetizar en cada despliegue.
- Los registros ya publicados no se reescriben; una modificación de contenido requiere una nueva versión revisada.

No se ejecuta ninguna carga curricular desde el frontend ni se exponen los importadores administrativos como endpoints públicos.
