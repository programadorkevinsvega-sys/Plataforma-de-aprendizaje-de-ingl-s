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

## 3. Cómo ejecutar la línea base completa

El workflow `.github/workflows/ci.yml` admite `workflow_dispatch`. La ruta manual activa las suites completas de Rust, frontend, ambas auditorías de dependencias y shell validation.

Ejecución pendiente:

1. Abrir GitHub Actions → CI.
2. Elegir `Run workflow` sobre `main`.
3. Esperar el job `CI result`.
4. Registrar URL, SHA, fecha, duración, estado por job y fallos.
5. Si falla, guardar causa y abrir corrección separada; no ocultar fallos con skips.

La conexión disponible durante esta auditoría permite consultar ejecuciones, pero no despachar un workflow manual. No se atribuye un resultado que todavía no se ejecutó.

## 4. Inventario de tests encontrado en el código

En los 37 archivos Rust inspeccionados se contaron aproximadamente 72 atributos `#[test]` y `#[tokio::test]`. Es un conteo estático de casos anotados, **no una medición de cobertura**.

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

`frontend/package.json` declara scripts `dev`, `build`, `start` y `lint`. No declara script de test ni cobertura. No se encontró framework de tests frontend ni suite E2E en el árbol del repositorio.

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
| CI documental | 25 s, éxito | Medido |
| CI completo Rust/frontend/audits | No ejecutado en commit base | Pendiente |
| Número de tests Rust anotados | ~72 | Conteo estático |
| Cobertura Rust | Sin reporte | No medida |
| Tests/cobertura frontend | Sin runner ni reporte | No medido |
| Carga/latencia | Sin reporte reproducible | No medida |
| Fixtures reproducibles de extremo a extremo | No encontrados | Pendiente |
| SLO | Sin valores medidos | Pendiente |

**Conclusión:** línea base incompleta. El gate de fase 0 no puede aprobarse con el CI documental como único indicador.
