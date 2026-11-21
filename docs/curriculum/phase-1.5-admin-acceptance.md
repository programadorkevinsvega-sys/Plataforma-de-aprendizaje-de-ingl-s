# Validación de aceptación de la administración curricular — fase 1.5

La fase 1.5 no se considera cerrada solo porque el backend, la migración y el editor visual compilen. El cierre requiere validar el recorrido web completo con una identidad de usuario que exista en la tabla `users` y esté habilitada en `content_editors`.

## Cobertura automatizada

La CI ejecuta dos niveles complementarios:

- `frontend/tests/phase1/curriculum-admin-workflow.test.mjs`: contrato del adaptador web con el BFF para cola editorial paginada y filtrada, detalle del curso, importación en vista previa y aplicación, guardado de borrador, solicitud de cambios, aprobación y publicación. También comprueba que un HTTP 403 no se convierta en una cola vacía.
- `tools/curriculum/tests/editorial_workflow.test.mjs` y `manage_content_editor.test.mjs`: transiciones y restricciones contra PostgreSQL, autorización por identidad registrada, y aprovisionamiento/revocación idempotente con transacción.

Estas pruebas automatizadas usan datos aislados de CI. No sustituyen el recorrido visual en el navegador desplegado.

El test `tools/curriculum/tests/acceptance_smoke.test.mjs` verifica en CI la secuencia y las protecciones del smoke test ejecutable. Para recorrer el BFF desplegado y PostgreSQL del entorno real se dispone de `tools/curriculum/acceptance-smoke.mjs`; este último requiere dos cuentas reales y se ejecuta de forma explícita, nunca desde CI ni desde el despliegue.

## Smoke test HTTP en staging con cuentas reales

El script realiza un recorrido real contra el origen del BFF: login de editor y estudiante, denegación 403 del estudiante, dry-run sin persistencia, importación como borrador, edición con revisión SHA-256, rechazo de una escritura obsoleta (409), solicitud de cambios, reenvío, aprobación, publicación, aparición en el catálogo del estudiante y rechazo de edición después de publicar.

**Preparación:**

1. Despliega primero la versión de la aplicación en un entorno staging con las migraciones al día.
2. Registra dos usuarios mediante la aplicación: uno que será editor y otro que seguirá siendo estudiante.
3. Concede `content_editors` únicamente al primero, usando el procedimiento de la sección siguiente.
4. Ejecuta el script desde la raíz del repositorio. No habilites trazas de shell (`set -x`) ni guardes las contraseñas en archivos versionados.

Ejemplo Bash, solicitando las contraseñas de forma interactiva:

```bash
export CURRICULUM_ACCEPTANCE_ENV=staging
export CURRICULUM_API_BASE_URL='https://<origen-bff-staging>'

read -r -p 'Correo del editor: ' CURRICULUM_EDITOR_EMAIL
read -r -s -p 'Contraseña del editor: ' CURRICULUM_EDITOR_PASSWORD
printf '\n'
read -r -p 'Correo del estudiante sin permisos: ' CURRICULUM_NON_EDITOR_EMAIL
read -r -s -p 'Contraseña del estudiante: ' CURRICULUM_NON_EDITOR_PASSWORD
printf '\n'
export CURRICULUM_EDITOR_EMAIL CURRICULUM_EDITOR_PASSWORD
export CURRICULUM_NON_EDITOR_EMAIL CURRICULUM_NON_EDITOR_PASSWORD

node tools/curriculum/acceptance-smoke.mjs

unset CURRICULUM_EDITOR_PASSWORD CURRICULUM_NON_EDITOR_PASSWORD
```

El paquete por defecto es `tests/fixtures/curriculum/initial-release-english-general-pre-a1-v1.json`. Puede sustituirse con `CURRICULUM_ACCEPTANCE_PACKAGE`. El script exige HTTPS y `CURRICULUM_ACCEPTANCE_ENV=staging`, y bloquea el host de producción conocido `app-ingles.jnmtortas.com`.

**Efecto persistente:** para demostrar la publicación, el script crea un curso con slug único `staging-acceptance-<id>` y lo deja publicado en el catálogo de staging. No elimina ese curso al terminar; conserva la evidencia para inspección. No lo ejecutes en producción. El script no concede ni revoca permisos: eso se administra por separado.

Este smoke test valida la integración HTTP real, pero no reemplaza la comprobación visual de paginación, controles, formularios y estados de la página `/admin/curriculum`. El recorrido manual que sigue continúa siendo obligatorio.

## Ejecución del smoke test real desde GitHub Actions

El repositorio incluye el workflow manual **Curriculum staging admin acceptance** en `.github/workflows/curriculum-staging-acceptance.yml`. Este workflow ejecuta el script HTTP anterior contra un staging ya desplegado; no crea ni despliega infraestructura y no reutiliza las credenciales de producción.

Configura el GitHub Environment `staging` con estas variables:

| Tipo | Nombre |
|---|---|
| Variable | `CURRICULUM_API_BASE_URL` — origen HTTPS del BFF staging, sin ruta |
| Variable | `CURRICULUM_EDITOR_EMAIL` |
| Variable | `CURRICULUM_NON_EDITOR_EMAIL` |
| Secret | `CURRICULUM_EDITOR_PASSWORD` |
| Secret | `CURRICULUM_NON_EDITOR_PASSWORD` |

Las dos cuentas deben estar registradas **en staging**. La primera debe existir en `content_editors`; la segunda no debe tener permiso editorial. Concede el permiso solamente en la base de staging mediante `manage_content_editor.mjs`; no copies una fila ni una credencial de producción.

Para ejecutar: abre **Actions → Curriculum staging admin acceptance → Run workflow**, selecciona `main` y marca `confirm_staging=true`. El workflow exige ambos controles, usa el Environment `staging`, valida que las cuentas sean distintas y ejecuta `node tools/curriculum/acceptance-smoke.mjs`. El propio script rechaza el host de producción conocido y crea un curso de aceptación único que queda publicado en staging para inspección.

El workflow no despliega staging. Primero debe existir un BFF/Next.js desplegado con las migraciones aplicadas y una base de datos independiente de producción. Si ese entorno todavía no existe, no ejecutes el workflow ni sustituyas su URL por la de producción.

## Aceptación en producción cuando no existe staging

No se debe ejecutar `acceptance-smoke.mjs` contra producción: ese flujo crea, edita, aprueba y publica un curso de prueba que permanece en el catálogo, y no dispone de una limpieza segura posterior. Las versiones publicadas son inmutables y las relaciones curriculares usan restricciones `RESTRICT`.

En ausencia de staging, se dispone del workflow manual **Curriculum production read-only acceptance** (`.github/workflows/curriculum-production-readonly-acceptance.yml`). Se ejecuta contra el origen oficial de producción y realiza únicamente:
- Login real de la cuenta editorial y la cuenta estudiante.
- Comprobación de `403` para el usuario sin permiso editorial.
- Lectura paginada de la cola editorial con la cuenta editora.
- Lectura del catálogo publicado y de los primeros diez detalles con la cuenta estudiante.
- Validación de que el catálogo no entrega versiones que no estén publicadas.

El workflow no importa paquetes, no guarda borradores, no tramita revisiones, no publica ni archiva cursos. Las únicas solicitudes `POST` son los dos logins normales; las comprobaciones de dominio curricular son `GET`.

Configura el GitHub Environment `production`:
- Variables `CURRICULUM_EDITOR_EMAIL` y `CURRICULUM_NON_EDITOR_EMAIL`.
- Secrets `CURRICULUM_EDITOR_PASSWORD` y `CURRICULUM_NON_EDITOR_PASSWORD`.
- Reutiliza `NEXT_PUBLIC_BFF_URL` como origen del BFF. El script solo acepta `https://app-ingles.jnmtortas.com`.

Para ejecutar: **Actions → Curriculum production read-only acceptance → Run workflow**, desde `main`, marcando `confirm_production_readonly=true`. Deben usarse dos cuentas reales distintas; solo la primera debe pertenecer a `content_editors`.

Esta prueba confirma autenticación, autorización, lectura de la administración y catálogo real, pero deliberadamente **no** certifica la mutación completa draft→review→approved→published en producción. Ese recorrido de escritura permanece cubierto por PostgreSQL/CI y por Playwright con BFF simulado. El recorrido visual manual en producción debe limitarse a navegar/consultar con las dos cuentas, sin editar ni publicar contenido existente.

## E2E visual automatizado en Chromium

La CI construye el frontend de producción, levanta `next start` y ejecuta Playwright sobre un navegador Chromium real. La suite `frontend/tests/e2e/curriculum-admin.spec.mjs` recorre:

- Redirección al login cuando no hay sesión.
- Error 403 visible para una cuenta autenticada sin capacidad editorial; nunca se representa como cola vacía.
- Paginación real de la interfaz, búsqueda y filtro por estado.
- Previsualización dry-run y confirmación de importación.
- Apertura del editor visual, guardado del borrador y confirmación de revisión SHA-256.
- Envío a revisión, solicitud de cambios con comentarios, segundo guardado, aprobación y publicación.

Esta suite intercepta las llamadas HTTP al BFF con respuestas controladas para que sea determinista en CI. Ejecuta la aplicación Next.js compilada y sus componentes reales, pero **no** prueba PostgreSQL ni sustituye el smoke test HTTP contra staging con cuentas reales. El runner Playwright está fijado en `@playwright/test 1.65.1`; los diagnósticos de navegador se conservan como artefacto de CI cuando existan.

## Verificación completa del catálogo fuente

La CI ejecuta `node tools/curriculum/audit_lexical_catalog.mjs --strict` y `node --test tools/curriculum/tests/*.test.mjs`. El test `lexical_catalog_audit.test.mjs` carga la fuente canónica completa y verifica, entre otros invariantes, 26 categorías, 790 entradas léxicas, 2.201 ejemplos, 26 recursos (13 Reading y 13 Listening) y 52 preguntas; también comprueba niveles Pre-A1/A1, revisión pendiente, estado editorial, referencias, pronunciación y audio de Listening. Es una auditoría estructural/semántica reproducible del catálogo fuente, no una declaración de que todos esos ítems estén aprobados o publicados.

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
