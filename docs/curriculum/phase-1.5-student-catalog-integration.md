# Catálogo curricular y administración editorial web (Fase 1.5)

## Estado y alcance

La implementación de la Subfase 1.5 está integrada en `main` mediante PR #81, #82, #94, #96 y #97. Incorpora el catálogo estudiantil por versión inmutable, paginación/filtros PostgreSQL, progreso sustentado en evidencia persistida y la administración protegida para importar como borrador, editar, tramitar revisión y publicar. El editor visual guarda transaccionalmente, aplica control de concurrencia y conserva revisiones append-only con SHA-256.

**Estado: IMPLEMENTACIÓN INTEGRADA; aceptación manual HTTP/visual PENDIENTE.** La suite de CI cubre las pruebas automatizadas disponibles (incluido E2E Chromium con BFF simulado y pruebas PostgreSQL de edición). Todavía no se ha validado el recorrido completo con cuentas humanas contra la web desplegada. El usuario realizará esa aceptación después, en producción, porque el proyecto no tiene un entorno staging configurado. Por tanto, no se declara cerrada la Subfase 1.5.

## 1. Catálogo estudiantil: filtros y paginación reales

**GET /api/v1/curriculum/courses** acepta:

| Query | Significado | Valores |
|---|---|---|
| page | Página (base 1) | Entero positivo; default 1 |
| page_size | Tamaño de página | Default 12; máximo 50 |
| track_code | Ruta | general o technology |
| cefr_level | Nivel | PRE_A1, A1, A2, B1, B2, C1, C2 |
| search | Busca en slug, título y descripción | Hasta 120 caracteres |
| enrolled_only | Solo matrículas del usuario | true / false |

El servicio ejecuta conteo y consulta paginada en PostgreSQL dentro de una transacción. El resultado incluye total, page, page_size y total_pages. Las versiones publicadas se listan para estudiantes; las archivadas solo cuando el usuario conserva matrícula sobre esa versión. La pantalla /courses usa estos parámetros y no descarga todo el catálogo para filtrar localmente.

## 2. Progreso y desbloqueo de lecciones

El detalle de una versión exacta devuelve un objeto progress por lección:

- not_enrolled: no existe matrícula para esa versión.
- locked: no se satisfacen uno o más prerrequisitos.
- available: está matriculado y los prerrequisitos se satisfacen.
- in_progress: existe evidencia parcial para objetivos requeridos.
- completed: todos los objetivos requeridos tienen evidencia para todas sus referencias.
- mastered: los objetivos requeridos están completados y la cobertura de repetición SM-2 alcanza el umbral definido.

### Evidencia que se usa hoy

- Las referencias de vocabulario se contrastan con learning_progress_events para el usuario autenticado.
- Las referencias de frases se contrastan con user_srs_progress; una revisión exitosa conserva repetitions > 0, y los fallos reinician ese contador.
- Para los requisitos mastered, la señal disponible es una cobertura de repetición por frase, limitada a tres repeticiones exitosas.

**Límite académico importante:** esa cobertura SM-2 es una señal de práctica/retención de vocabulario y frases, no una calificación lingüística ni una certificación de dominio. Los objetivos de gramática, escritura, pronunciación y expresión oral que requieran evaluar respuestas todavía necesitan intentos evaluados del motor de actividades de Fase 2. Una lección desbloqueada tampoco significa que ya exista una actividad interactiva para ejecutarla.

## 3. Administración curricular y autorización

La ruta frontend es /admin/curriculum. La API valida el JWT en el BFF y vuelve a comprobar el usuario contra content_editors desde PostgreSQL, dentro de una transacción que configura app.current_user_id. El frontend no puede concederse el rol y ocultar botones no es la barrera de seguridad.

Endpoints del BFF:

| Método | Ruta | Uso |
|---|---|---|
| GET | /api/v1/curriculum/editor/versions | Cola editorial paginada y filtrable por estado/búsqueda |
| POST | /api/v1/curriculum/editor/import | Validación/previsualización o importación explícita de un paquete |
| POST | /api/v1/curriculum/editor/versions/{course_version_id}/actions | Enviar a revisión, registrar decisión o publicar |
| PUT | /api/v1/curriculum/editor/versions/{course_version_id}/draft | Guardar cambios campo a campo en una versión draft |

### Importación desde la web

1. El editor selecciona o pega un JSON canónico v1.
2. **Validar y previsualizar** ejecuta la validación estructural, cálculo SHA-256, resolución exacta de referencias de vocabulario/frases y los mismos INSERTs/transacciones. Al final revierte todo (dry_run=true).
3. **Confirmar importación como borrador** repite la operación con apply=true y crea una versión nueva en estado draft.
4. La importación es idempotente para la misma huella y se niega a sobrescribir una versión existente con contenido diferente. Para un contenido corregido se usa una nueva versión del paquete; no se muta una versión ya registrada.

El paquete admite máximo 1.5 MB. El importador rechaza claves JSON duplicadas, campos fuera del contrato, IDs/códigos duplicados, referencias ausentes o ambiguas, objetivos huérfanos y ciclos de prerrequisitos. Nunca crea una versión directamente en published.

### Revisión y publicación

- draft -> review: el editor envía una versión a revisión y PostgreSQL congela su contenido.
- approved: se agrega una decisión append-only; la versión permanece en review.
- changes_requested o rejected: requieren comentarios y devuelven la versión a draft.
- publish: solo el editor que registró la última aprobación puede publicar. PostgreSQL vuelve a comprobar integridad, objetivos requeridos, competencias primarias y congelación del contenido antes de cambiar el estado.

La cola muestra el último comentario, decisión, huella del paquete y si el editor autenticado puede publicar.

### Editor visual de borradores existentes

- En una fila con estado `draft`, el editor puede abrir **Editar borrador** y modificar título/descripción del curso, título/tema/descripción/duración de unidades, título/descripción/duración de lecciones y descripción/criterios de éxito de objetivos.
- Los IDs, códigos, posiciones, jerarquía unidad-lección, relaciones lección-objetivo, competencias, prerrequisitos y referencias léxicas/de frases se muestran como estructura protegida; el endpoint rechaza JSON que intente añadir, quitar, mover o reordenar esos elementos.
- El BFF transmite el `updated_at` leído en la cola como token de concurrencia. Si otra persona guardó antes, la API devuelve conflicto HTTP 409 y obliga a recargar antes de volver a editar.
- El servicio vuelve a comprobar `content_editors`, bloquea la fila padre `course_versions`, exige que el estado siga siendo `draft` y guarda los cambios en una sola transacción PostgreSQL.
- Cada guardado material crea una fila append-only en `curriculum_draft_revisions`, con snapshot JSON y SHA-256. Repetir exactamente el último contenido no crea una revisión duplicada.
- Al enviar la versión a `review`, la protección existente de PostgreSQL congela las filas hijas; un guardado concurrente no puede alterar una versión que ya haya entrado en revisión.

### Provisionamiento inicial de editores

La tabla content_editors requiere que un administrador de plataforma registre explícitamente el UUID de la cuenta editorial mediante el procedimiento seguro de administración de base de datos. No se concede la capacidad desde el navegador ni automáticamente al primer usuario. Hasta ese provisionamiento, la pantalla mostrará acceso denegado (HTTP 403), aunque la ruta sea visible.

## 4. Qué se conserva de la aplicación actual

- /learn y el Sistema Dual de Pronunciación siguen intactos.
- /courses es la navegación académica para estudiantes.
- /courses/{course_version_id} presenta la versión inmutable, prerrequisitos, objetivos y progreso disponible.
- /admin/curriculum es el área administrativa protegida por la capacidad de base de datos.
- No se utilizan fixtures de CI como catálogo de producción.

## 5. Aceptación manual pendiente en producción

No hay un servidor staging configurado. La verificación pendiente se hará desde la web desplegada y con las cuentas reales ya existentes; no requiere crear variables ni secretos nuevos en GitHub.

- [ ] Entrar en `/admin/curriculum` con una cuenta que ya tenga la capacidad editorial y comprobar carga de cola, búsqueda, filtros y paginación.
- [ ] Entrar con una cuenta normal y comprobar que la interfaz y la API responden 403 y no muestran la cola editorial.
- [ ] Ejecutar el dry-run de un paquete válido y comprobar que no crea una versión; luego importar un paquete de prueba aprobado como `draft` solo cuando se haya elegido un borrador seguro.
- [ ] Editar campos permitidos y comprobar el historial; verificar que un guardado con `updated_at` obsoleto produce 409.
- [ ] Completar cambios solicitados → corrección → reenvío → aprobación → publicación usando únicamente contenido real revisado, nunca fixtures ni cursos ficticios.
- [ ] Verificar el curso/versionado en el catálogo estudiantil y confirmar que una versión publicada ya no admite edición.
- [ ] Comprobar que revocar la capacidad editorial vuelve a producir 403 y restaurarla solo mediante el procedimiento administrativo autorizado.
- [ ] Registrar fecha, versión curricular probada y evidencia (sin contraseñas ni tokens).

**Protección:** `tools/curriculum/acceptance-smoke.mjs` crea y publica un curso de aceptación y tiene un guard que bloquea producción. No ejecutar ese script contra la URL productiva. El workflow de staging se retiró porque el entorno no existe; no se necesitan nuevas variables ni secretos de GitHub para la aceptación manual.

## 6. Backlog fuera de 1.5

1. Intentos y rúbricas del motor de actividades Fase 2 para que gramática, escritura, listening y speaking tengan progreso evaluado real, además de práctica de vocabulario/SRS.
2. Curación editorial y expansión del catálogo posterior al piloto de Subfase 1.4: calidad lingüística de traducciones, ejemplos, guías fonéticas y audios lento/natural.
3. Cargar y validar futuras publicaciones de contenido real, con referencias exactas y decisiones editoriales humanas.

El fixture tests/fixtures/curriculum/phase1_3_content_package_v1.json se utiliza únicamente para CI y validación de esquema. No es contenido real y no debe importarse ni publicarse en producción.

## 6. Límites y operación

- El BFF valida el token y el servicio curricular valida la identidad y aplica RLS en la misma transacción.
- El importador mantiene las transacciones atómicas; un fallo de referencia o de integridad revierte la importación completa.
- Los endpoints editoriales devuelven 403 a cuentas que no estén en content_editors.
- La publicación solo se realiza desde una versión review cuya última decisión sea approved por el mismo editor que publica.
- La edición visual solo modifica versiones draft y registra snapshots inmutables; no existe una ruta para sobrescribir contenido en review/published.
- La publicación privada inicial de Inglés General (PR #93) se ejecutó desde CI/CD y dejó dos versiones PRE_A1/A1 con contenido real seleccionado. Esa publicación corresponde a la Subfase 1.4; no sustituye la aceptación de la administración web de 1.5, que sigue pendiente con cuentas humanas.
