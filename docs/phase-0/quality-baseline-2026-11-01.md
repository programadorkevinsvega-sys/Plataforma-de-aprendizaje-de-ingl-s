# Línea base de calidad — 2026-11-01

## 1. Commit de partida

- Repositorio: `programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s`
- Rama: `main`
- Commit: `a905574425b650ac1ebf0ac054a0169ce4f47cab`
- Commit: merge PR #63, sincronización documental.
- CI run #168: [ver ejecución](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/actions/runs/41316244682)
- Deploy workflow run #24: [ver ejecución](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/actions/runs/41316280751)

## 2. Resultado real de CI

| Dato | Resultado |
|---|---|
| CI #168 | success |
| Inicio | 2026-11-01 14:26:59 UTC |
| Fin | 2026-11-01 14:27:24 UTC |
| Duración aproximada | 25 s |
| Clasificador de cambios | success |
| Markdown lint | success |
| Rust fmt, lint, build y tests | skipped |
| Frontend lint y build | skipped |
| Auditoría RustSec | skipped |
| Auditoría npm | skipped |
| Shell/deploy validation | skipped |
| Job final CI result | success |

El cambio incluía únicamente Markdown. Por diseño, el clasificador ejecutó lint documental y omitió el resto. Por ello, el resultado es válido para ese cambio documental, pero **no constituye una ejecución del CI completo de la línea base**.

El workflow `Deploy Ubuntu (systemd)` #24 completó el job de detección, pero sus jobs de build y activación quedaron `skipped`: cambio documental, sin despliegue de aplicación. No usar este run como evidencia de un release productivo nuevo.

## 3. Ejecución de la matriz completa

El workflow `.github/workflows/ci.yml` admite `workflow_dispatch`, que activa todas las validaciones. La conexión usada para esta auditoría no permite despachar manualmente ese evento.

Para medir la línea base sin modificar código de aplicación, se ejecutó la matriz completa mediante un comentario temporal en el archivo del workflow. El clasificador interpreta cualquier cambio en `.github/workflows/*` como motivo para ejecutar Rust, frontend, ambas auditorías y shell validation. El comentario no modificó la lógica del workflow.

- Ejecución: [CI #174](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/actions/runs/41318854965)
- SHA probado: `d7e7f31008e9bcd4b665a73687d4358e984a5232`
- Inicio: 2026-11-01 14:58:54 UTC.
- Fin: 2026-11-01 15:02:34 UTC.
- Duración: 3 min 40 s.
- Resultado agregado: `success`.

El PR de auditoría solo añadió documentación y ese comentario temporal. Rust, frontend, Protobuf, migraciones, scripts de despliegue y dependencias de aplicación permanecieron idénticos al commit base `a905574425b650ac1ebf0ac054a0169ce4f47cab`. Por tanto, la matriz valida la línea base del código de aplicación, aunque el SHA ejecutado sea el head documental del PR y no el SHA de `main` directamente.

Jobs ejecutados y resultado:

| Job | Resultado |
|---|---|
| Clasificación de cambios | success |
| Rust format, check, build, Clippy y tests | success |
| Frontend lint y build de producción | success |
| Rust dependency audit | success |
| Frontend dependency audit | success |
| Markdown lint | success |
| Shell/deploy validation | success |
| CI result | success |

El evento fue `pull_request`; no se ejecutó build de release ni despliegue productivo. El resultado de este run no es evidencia de un despliegue.

## 4. Inventario de tests encontrado en el código

En CI #174 se ejecutaron **72 tests Rust: 72 passed, 0 failed, 0 ignored**. El total coincide con el conteo estático de casos anotados en los 37 archivos Rust inspeccionados. Este resultado no constituye una medición de cobertura.

Áreas con pruebas encontradas:

- Auth/JWT, refresh tokens y controles de perfil.
- BFF: auth, evaluación, CORS y request limiter.
- AI evaluator: cálculo de métricas y detección de debilidades.
- Audio: transliteración y selección/configuración de TTS.
- SRS: reglas básicas SM-2.
- Gamification: progresión XP, idempotencia/concurrencia y aislamiento RLS.
- Common: autenticación, validación y errores.
- Deploy: validaciones de scripts/health checks.

Hay tests de integración que usan PostgreSQL y `TEST_DATABASE_URL`. CI prepara una instancia de PostgreSQL y aplica migraciones antes de correr los tests Rust cuando el job está seleccionado.

## 5. Frontend y cobertura

`frontend/package.json` declara scripts `dev`, `build`, `start` y `lint`. No declara script de test ni cobertura. No se encontró framework de tests frontend ni suite E2E en el árbol del repositorio. En CI #174, ESLint terminó con 0 errores y 1 advertencia en `frontend/src/app/page.tsx:88` sobre `window.location.assign()` para navegación interna. Next.js compiló correctamente el bundle de producción.

No se encontró un job de cobertura ni un reporte de cobertura versionado para Rust o frontend. La cobertura inicial queda como **no medida**, no como 0%.

## 6. Rendimiento, carga y observabilidad

No se encontró un perfil de carga reproducible, dataset sintético común, herramienta de carga o reporte de latencias/throughput en el repositorio inspeccionado.

Métricas que deben medirse antes de fijar SLO o umbrales:

| Área | Medición inicial requerida |
|---|---|
| BFF | p50/p95/p99 por ruta, tasa de error, conexiones concurrentes |
| gRPC | latencia/errores por método y servicio, deadlines y requests en vuelo |
| PostgreSQL | conexiones usadas, espera del pool, duración/errores de consultas |
| TTS/STT/Bedrock | latencia, error, rate-limit, timeout, coste por operación |
| Learning | vocabulario servido, finalización de sesión, errores de persistencia |
| SRS | tarjetas pendientes, revisiones/minuto, fallos de escritura |
| Gamification | eventos nuevos/duplicados, latencia de transacción |
| Frontend | LCP/INP/CLS y errores cliente, segmentado por ruta/dispositivo |

No fijar objetivos numéricos de capacidad hasta generar la primera medición repetible.

## 7. Fixtures y datos sintéticos

Evidencia actual:

- Tests de integración crean registros con UUID aleatorios y PostgreSQL de prueba.
- No se encontró una biblioteca común de fixtures estable de usuarios/roles/contenidos.
- Los JSON A0/A1 son dataset de contenido, no sustituyen fixtures de tests ni demuestran que se hayan importado a la base desplegada.
- No se encontró generador de usuarios, sesiones, conversaciones o carga sintética.

Propuesta de fixtures reproducibles:

- Usuarios: estudiante A0, estudiante A2, estudiante B2, usuario sin sesiones, usuario con sesiones, administrador de contenido y administrador de plataforma.
- Aislamiento: dos usuarios con vocabulario/SRS/progreso propios; intentos de acceso cruzado.
- Contenido: palabras con guía dual revisada, frase con audio, contenido sin audio, ejercicio cerrado y ejercicio abierto.
- Evaluación: respuesta escrita, recording de voz, transcripción, listening audio-first, audio vacío/ruidoso y evidencia insuficiente.
- Resiliencia: fallo DB, timeout Bedrock/Transcribe/TTS, caída de servicio gRPC, retry duplicado y operación parcial.
- Volumen: generador con semilla fija, volumen y distribución configurable; nunca incluir datos personales reales.

## 8. Decisión de línea base

| Indicador | Base disponible | Estado |
|---|---|---|
| CI documental #168 | 25 s, éxito | Medido |
| CI completo #174 | 3 min 40 s, éxito; 7 jobs de validación pasaron | Medido sobre el mismo árbol de código de aplicación |
| Tests Rust | 72 passed, 0 failed, 0 ignored | Ejecutado en CI |
| Frontend lint/build | Éxito; 1 warning de ESLint | Ejecutado en CI |
| Auditoría npm | 21 vulnerabilidades: 2 low, 19 moderate; sin high reportadas por el umbral configurado | Ejecutado en CI |
| Auditoría RustSec | Éxito; 385 dependencias en Cargo.lock, base de 1.395 advisories cargada | Ejecutado en CI |
| Cobertura Rust | Sin reporte | No medida |
| Tests/cobertura frontend | Sin runner ni reporte | No medido |
| Carga/latencia | Sin reporte reproducible | No medida |
| Fixtures reproducibles de extremo a extremo | No encontrados | Pendiente |
| SLO | Sin valores medidos | Pendiente |

**Conclusión:** línea base incompleta. El gate de fase 0 no puede aprobarse con el CI documental como único indicador.

## 9. Hallazgos de CI #174 que requieren seguimiento

### Frontend

- `npm ci` instaló 580 paquetes y auditó 581.
- `npm audit --audit-level=high` encontró 21 vulnerabilidades: 2 de severidad baja y 19 moderadas. No reportó vulnerabilidades altas bajo el umbral configurado.
- El reporte incluye `minimatch` y dependencias del toolchain ESLint/TypeScript ESLint. No ejecutar `npm audit fix --force` de forma automática: el propio reporte advierte que puede forzar una versión incompatible de ESLint.
- ESLint finalizó con 0 errores y 1 warning en `frontend/src/app/page.tsx:88` por usar `window.location.assign()` para una ruta interna.
- npm avisó que la versión instalada `eslint@9.39.5` está deprecated/no longer supported.

### Rust

- `cargo fmt --all -- --check`, `cargo check --workspace --all-targets --locked`, `cargo build --workspace --all-targets --locked`, Clippy y `cargo test --workspace --locked` terminaron correctamente.
- Los 72 tests ejecutados pasaron.
- Las nueve migraciones SQL se aplicaron en la instancia PostgreSQL de CI antes de ejecutar los tests.
- La auditoría RustSec finalizó correctamente con la configuración versionada de excepciones para dependencias opcionales inactivas.

### Pendientes que CI no resuelve

- No se generó reporte de coverage para Rust ni frontend.
- No existe suite frontend/E2E en el repositorio.
- No se ejecutaron pruebas de carga ni mediciones de latencia.
- No se verificó la operación real de Bedrock, Transcribe, TTS, Redis o NATS contra los entornos de producción.
