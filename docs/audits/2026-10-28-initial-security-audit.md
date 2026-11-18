# Auditoría inicial de seguridad y hoja de ruta — DevFluency

- **Fecha de inspección:** 2026-10-28
- **Rama inspeccionada:** `main`
- **Commit inspeccionado:** `1ee5727419358b60f72b27a453057fd2a3369fbe`
- **Alcance:** inspección estática de archivos/versionado del repositorio, sin ejecutar binarios ni pruebas dinámicas.
- **Estado de evidencia:** este documento no equivale a una auditoría de penetración ni a una certificación de preparación para producción.

## Resumen ejecutivo

La base contiene un workspace Rust con BFF Axum, seis servicios gRPC, frontend Next.js, migraciones PostgreSQL y cinco scripts de verificación. La revisión de código estático confirma riesgos importantes en el manejo de secretos, la autorización por identidad, el almacenamiento de tokens, el aislamiento RLS y la confiabilidad de los scripts de verificación.

No se observó una carpeta `.github/workflows/` en el árbol inspeccionado. El `README.md` solo contiene el nombre del repositorio. No había PR ni issues abiertos en la inspección inicial. Los artefactos `artifacts/verify/fase*/latest.json` contienen resultados históricos, pero no prueban el estado actual del código.

**Recomendación inicial:** no declarar el proyecto listo para producción hasta cerrar los bloqueos P0/P1, ejecutar pruebas reproducibles en CI, revisar autorización en todos los servicios y verificar despliegue/recuperación con un entorno representativo.

## Hallazgos confirmados en la inspección estática

| ID | Prioridad | Hallazgo observado en el commit inspeccionado | Riesgo | Remediación / evidencia |
| --- | --- | --- | --- | --- |
| SEC-001 | P0 | `crates/auth-identity-service/src/jwt.rs` proporciona un secreto JWT por defecto en código. | Tokens firmados con una clave conocida pueden ser falsificados si la configuración no la reemplaza. | PR #1 elimina el fallback y exige `JWT_SECRET` de al menos 32 bytes. |
| SEC-002 | P0 | Varios servicios Rust y `run_all.sh` proporcionan una URL PostgreSQL con credenciales fijas cuando falta `DATABASE_URL`; Docker Compose define contraseñas estáticas. | Uso accidental de credenciales conocidas y configuración implícita. | PR #1 elimina valores de respaldo y exige configuración explícita. Se requiere rotar cualquier secreto real o reutilizado fuera de desarrollo. |
| SEC-003 | P0 | `GetUserProfile` y `UpdateUserProfile` confiaban en un `user_id` enviado por gRPC sin vincularlo a una identidad autenticada. | Lectura/modificación de perfil ajeno por acceso directo al servicio. | PR #4 exige bearer JWT en metadata y compara el sujeto con el usuario solicitado. |
| SEC-004 | P1 | `frontend/src/infrastructure/storage/SessionStorage.ts` guardaba payload que contiene tokens tanto en `sessionStorage` como en `localStorage`. | Mayor persistencia del token y exposición frente a XSS. | PR #5 elimina la lectura/escritura de `localStorage`. `sessionStorage` sigue siendo accesible por JS; queda pendiente migración a cookie HttpOnly/CSRF. |
| SEC-005 | P1 | Los listeners HTTP/gRPC escuchaban en `0.0.0.0`. | Exposición de puertos fuera del host si la red/despliegue no los restringe. | PR #3 cambia el valor predeterminado a loopback; una exposición explícita requiere firewall y seguridad de transporte/servicio. |
| SEC-006 | P1 | Los scripts `verify_fase1.sh`–`verify_fase5.sh` usaban `set -e` junto con pipes a `tee`, sin `pipefail`. | Un comando dentro del pipeline puede fallar sin que el script falle, generando resultados `PASSED` engañosos. | PR #2 usa `set -euo pipefail`. |
| SEC-007 | P1 | La operación de registro inserta usuario y estadísticas en sentencias separadas sin transacción explícita. | Fallo parcial con usuario creado sin estado auxiliar. | Pendiente: transacción + pruebas de rollback y concurrencia. |
| SEC-008 | P1 | La respuesta de auth incluye `refresh_token_placeholder`; no se observó un ciclo de renovación/revocación real en el código inspeccionado. | La renovación anunciada no es funcional y logout no revoca el JWT. | Pendiente: diseñar sesión real o eliminar el contrato ficticio, con persistencia, rotación, expiración y pruebas. |
| SEC-009 | P1 | El BFF configuraba CORS con origen y cabeceras amplios. | Cualquier origen web puede intentar interactuar con el BFF; el impacto exacto depende de credenciales y modelo de sesión. | Pendiente: allowlist por entorno, validación de preflight y pruebas. |
| SEC-010 | P1 | Las políticas RLS observadas cubren `user_srs_progress`, `ai_exam_sessions` y `user_stats`, pero no todas las tablas sensibles; el helper RLS usa SQL construido por formato. | Aislamiento incompleto si rutas/roles dependen de RLS; contexto mal aplicado puede mezclar usuarios. | Pendiente: inventario de tablas/roles, `set_config(..., true)` parametrizado dentro de transacción y pruebas negativas multiusuario. |
| SEC-011 | P1 | Algunos handlers del BFF sustituyen fallos de perfil por valores predeterminados o devuelven errores internos textuales. | Datos falsos ante fallos e información técnica excesiva en respuestas. | Parcialmente tratado por PR #4; auditar los demás handlers y normalizar errores sin filtrar detalles. |
| SEC-012 | P1 | El servicio gRPC recibe llamadas por red sin que la inspección haya encontrado una política general de autenticación de servicio/mTLS. | Clientes no confiables podrían invocar métodos si alcanzan los puertos; la autorización por usuario sigue siendo desigual entre servicios. | Pendiente: threat model, authn de servicios, TLS/mTLS según despliegue, autorización por método y reglas de red. |
| SEC-013 | P2 | No se observó `.github/workflows/` y `frontend/package.json` no define un script de pruebas unitarias. | No hay evidencia automatizada visible de que los controles se ejecuten antes de integrar. | Pendiente: CI para fmt/clippy/test, lint/build frontend, migraciones, dependencias y escaneo de secretos; añadir integración/E2E. |
| SEC-014 | P2 | `README.md` es mínimo y los guiones de inicio/build aplican migraciones con un flujo simple sin registro de versión/rollback demostrable. | Configuración difícil de reproducir y recuperación no demostrada. | Pendiente: guía de operación, migraciones versionadas con historial, backup/restauración y runbooks. |

## Estado inicial por fase / módulo

Los estados siguientes reflejan **solo la inspección estática inicial**. La presencia de carpetas, interfaces o scripts no se considera prueba de funcionalidad completa.

| Fase / módulo | Estado inicial | Evidencia y trabajo necesario |
| --- | --- | --- |
| Infraestructura y persistencia | IMPLEMENTADO PARCIALMENTE | Workspace, Compose y migraciones presentes; configuración insegura, no se probó despliegue/restauración ni cobertura RLS. |
| Autenticación e identidad | IMPLEMENTADO PARCIALMENTE | Registro/login/JWT existen; secreto por defecto, refresh placeholder y autorización por perfil incompleta. |
| Contenido y motor fonético | IMPLEMENTADO PARCIALMENTE | Servicio, datos y motor fonético existen; falta ejecutar pruebas e2e/contrato y validar límites/errores. |
| Evaluación mediante IA | IMPLEMENTADO PARCIALMENTE | Servicio y dominio presentes; revisar integración real con Bedrock, límites y fallback; no se verificó acceso externo. |
| SRS y gamificación | IMPLEMENTADO PARCIALMENTE | Servicios y SQL presentes; falta comprobar aislamiento, atomicidad, invariantes y concurrencia. |
| Frontend y UX | IMPLEMENTADO PARCIALMENTE | Rutas y adaptadores existen; almacenamiento/fallback de sesión era inseguro; faltan pruebas automatizadas. |
| Integración entre servicios | IMPLEMENTADO PARCIALMENTE | Contratos protobuf y clientes existen; no se verificaron flujos completos ni tolerancia a fallos. |
| Observabilidad y producción | NO VERIFICADO | Scripts y logs existen, pero no hay evidencia suficiente de métricas, alertas, restauración, mTLS, rollback ni ejecución CI. |

## Matriz de trazabilidad priorizada

| ID | Prioridad | Tarea | Dependencias | Criterio de aceptación | Estado al publicar esta auditoría |
| --- | --- | --- | --- | --- | --- |
| SEC-001/002 | P0 | Eliminar secretos por defecto / credenciales incrustadas | Configuración por entorno y documentación de despliegue | Servicios fallan de forma segura sin secretos obligatorios; no quedan credenciales conocidas en código/configuración de ejemplo activa | PR #1 abierto, pruebas NOT RUN |
| SEC-003 | P0 | Vincular las operaciones de perfil con el sujeto JWT | Propagación segura del bearer entre BFF y auth gRPC | Pruebas negativas de A→perfil de B fallan con PermissionDenied | PR #4 abierto, pruebas NOT RUN |
| SEC-004 | P1 | Evitar token en localStorage y fallbacks de perfil cacheado | Refactor frontend | Sin uso de localStorage para tokens; error del servidor nunca se considera autenticación ni write exitosa | PR #5 abierto, pruebas NOT RUN |
| SEC-005 | P1 | Defaults de listener loopback | Configuración de redes de despliegue | Listener loopback por defecto y override explícito documentado | PR #3 abierto, pruebas NOT RUN |
| SEC-006 | P1 | Hacer veraces los gates de fase | Scripts de verificación | Pipeline de comando fallido termina en non-zero y no genera éxito falso | PR #2 abierto, scripts NOT RUN |
| SEC-007 | P1 | Hacer atómico el registro | Contrato de schema/estadísticas | Una falla auxiliar hace rollback del usuario y tests de concurrencia no crean duplicados | PENDIENTE |
| SEC-008 | P1 | Implementar o retirar refresh token ficticio y añadir revocación | Diseño de sesión; frontend/BFF; persistencia | Rotación/reutilización/expiración/logout probados de punta a punta | PENDIENTE |
| SEC-009/011/012 | P1 | CORS, errores, seguridad de transporte y autorización de todos los RPC | Threat model y topología real | Pruebas negativas por endpoint y políticas de red documentadas | PENDIENTE |
| SEC-010 | P1 | Corregir y verificar RLS | Modelo de roles y transacciones | Lectura/insert/update/delete entre usuarios aislados, contexto de conexión reseteado y roles no evaden RLS | PENDIENTE |
| SEC-013 | P2 | CI/CD con controles de calidad y seguridad | Definir entorno de servicios de prueba | fmt/lint/build/unit/integration/contract/security scanners pasan con permisos mínimos | PENDIENTE |
| SEC-014 | P2 | Readiness de producción, backup y recuperación | Infraestructura de despliegue | Restauración ensayada, health/readiness, límites, alertas y rollback verificados | PENDIENTE |

## Limitaciones de esta auditoría

- No se ejecutó `cargo check`, `cargo test`, `npm run lint`, `npm run build`, Docker Compose ni pruebas dinámicas.
- No se accedió a un entorno desplegado, base de datos de prueba, métricas ni secretos de infraestructura.
- No se revisó exhaustivamente cada ruta de cada servicio; los hallazgos listados son los confirmados durante la inspección estática.
- No se verificó escaneo del historial completo para credenciales previamente expuestas; una eliminación del último commit no revoca un secreto ya filtrado.
- Los PR referenciados están abiertos en borrador. Esto documenta propuestas, no cambios desplegados, aprobados o fusionados.

## Política de cierre de fase

Una fase no se debe marcar como completada hasta que sus criterios de aceptación y pruebas negativas relevantes pasen en CI, los contratos y migraciones estén revisados, los riesgos residuales estén aceptados formalmente y el resultado se verifique en un entorno representativo. Los estados `PASS`, `FAIL`, `NOT RUN`, `BLOCKED` y `PARTIAL` deben usarse con evidencia, no como etiquetas aspiracionales.
