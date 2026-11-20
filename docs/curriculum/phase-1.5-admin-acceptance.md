# Validación de aceptación de la administración curricular — fase 1.5

La fase 1.5 no se considera cerrada solo porque el backend, la migración y el editor visual compilen. El cierre requiere validar el recorrido web completo con una identidad de usuario que exista en la tabla `users` y esté habilitada en `content_editors`.

## Cobertura automatizada

La CI ejecuta dos niveles complementarios:

- `frontend/tests/phase1/curriculum-admin-workflow.test.mjs`: contrato del adaptador web con el BFF para cola editorial paginada y filtrada, detalle del curso, importación en vista previa y aplicación, guardado de borrador, solicitud de cambios, aprobación y publicación. También comprueba que un HTTP 403 no se convierta en una cola vacía.
- `tools/curriculum/tests/editorial_workflow.test.mjs` y `manage_content_editor.test.mjs`: transiciones y restricciones contra PostgreSQL, autorización por identidad registrada, y aprovisionamiento/revocación idempotente con transacción.

Estas pruebas automatizadas usan datos aislados de CI. No sustituyen el recorrido visual en el navegador desplegado.

## Habilitar una cuenta existente

Primero registra la cuenta mediante el flujo normal de registro de la aplicación. La herramienta no crea usuarios ni gestiona contraseñas; solo concede o revoca la capacidad editorial de una cuenta existente.

Con una conexión segura a la base de datos del entorno que se va a probar:

```bash
DATABASE_URL='postgres://...' node tools/curriculum/manage_content_editor.mjs \
  --email editor@tu-dominio.com --grant
```

La primera ejecución es una simulación y revierte la transacción. Revisa que correo y nombre correspondan a la cuenta correcta. Para confirmar el cambio:

```bash
DATABASE_URL='postgres://...' node tools/curriculum/manage_content_editor.mjs \
  --email editor@tu-dominio.com --grant --apply
```

Para retirar el permiso al terminar la prueba:

```bash
DATABASE_URL='postgres://...' node tools/curriculum/manage_content_editor.mjs \
  --email editor@tu-dominio.com --revoke
DATABASE_URL='postgres://...' node tools/curriculum/manage_content_editor.mjs \
  --email editor@tu-dominio.com --revoke --apply
```

Mantén `DATABASE_URL` fuera del repositorio, del historial del shell compartido y de los registros de CI. Ejecuta el procedimiento por un canal administrativo seguro.

## Recorrido manual obligatorio en staging

Usa un paquete curricular de prueba con un slug único. No publiques un paquete de prueba en producción.

1. Inicia sesión con una cuenta que **no** esté en `content_editors`. La administración debe mostrar el error de autorización y no aparentar que la cola está vacía.
2. Con la cuenta editorial habilitada, abre `/admin/curriculum`. Comprueba búsqueda, filtros por estado, paginación y detalle de versiones.
3. Previsualiza el paquete. Confirma que el modo dry-run muestra conteos y no crea una versión.
4. Aplica el paquete y confirma que aparece como `draft`.
5. Abre **Editar borrador**, modifica título/descripción del curso, unidad, lección y objetivo; guarda, recarga y confirma que los cambios persisten y se muestra la revisión con su huella.
6. Comprueba el conflicto de concurrencia con dos pestañas: guarda en una y trata de guardar desde la otra usando su estado anterior. La segunda escritura debe recibir 409 y exigir recarga.
7. Envía a revisión. El borrador debe quedar congelado. Solicita cambios con comentarios y confirma que vuelve a `draft`; corrige, reenvía, aprueba y publica.
8. Comprueba que el curso publicado aparece en el catálogo del estudiante y que la versión publicada ya no admite edición.
9. Revoca el permiso de la cuenta de prueba cuando corresponda y verifica que deja de acceder a la cola editorial.

## Criterio de cierre

La fase 1.5 se cierra cuando:

- La CI queda verde para el commit que contiene las pruebas de administración.
- La migración está aplicada en el entorno desplegado.
- Se completa y registra el recorrido manual anterior con una cuenta real del sistema (no solo una fila sintética creada por CI).
- Se confirma la publicación en el catálogo del estudiante y el bloqueo de edición posterior a publicación.

Hasta entonces el estado correcto de roadmap es **implementación lista, aceptación integral pendiente**.
