# Acta de aceptación técnica — Subfase 1.3

**Fecha de cierre:** 2026-11-18
**Estado:** Completada técnicamente, integrada en `main` y desplegada en producción
**Alcance:** contrato canónico v1, validación offline, importación/exportación PostgreSQL y ciclo editorial draft → review → publish.

## 1. Alcance aceptado

La subfase 1.3 entrega un flujo técnico versionado y trazable para intercambiar contenido curricular sin sobrescribir versiones ni modificar el estado académico de los estudiantes.

| Capacidad | Evidencia en el repositorio |
|---|---|
| Contrato JSON canónico v1 y validador offline | `tools/curriculum/content-package.schema.json`, `validate_content_package.py` y pruebas Python |
| Importación PostgreSQL transaccional | `import_content_package.mjs` y `import_content_package.test.mjs` |
| Exportación relacional verificable | `export_content_package.mjs` y `export_content_package.test.mjs` |
| Autorización explícita de editores | `content_editors`, `app_is_content_editor()` y pruebas de actor registrado/no registrado |
| Flujo editorial auditable | `manage_course_version.mjs`, `course_version_reviews` y `editorial_workflow.test.mjs` |
| Integridad académica al publicar e inmutabilidad durante revisión | Migración `20261118040000_curriculum_publication_completeness.sql` y regresiones editoriales |
| Migración desde instalación vacía y actualización de esquema | `scripts/test-phase1-2-migrations.sh` |

## 2. Criterios de aceptación verificados

- El paquete se valida offline; rechaza estructura inválida, campos desconocidos, referencias internas inválidas, duplicados, ciclos de prerrequisitos y objetivos huérfanos.
- La importación comprueba las referencias externas contra el catálogo existente, crea únicamente versiones nuevas en `draft`, tiene dry-run por defecto y requiere `--apply` para persistir.
- Los reintentos idénticos son idempotentes; las importaciones concurrentes de una misma versión se serializan; una versión existente no se sobrescribe con contenido distinto.
- Un error de referencia o de persistencia revierte la transacción completa.
- La exportación reconstruye el paquete desde una única instantánea relacional, vuelve a validarlo, conserva la presencia/ausencia de campos opcionales y compara su SHA-256 con el ledger de importación. Cualquier drift no se exporta silenciosamente.
- Solo un usuario registrado en `content_editors` puede ejecutar las operaciones editoriales. El GUC `app.content_editor` no concede permisos por sí mismo.
- El historial de revisiones es append-only. Publicar exige una aprobación vigente del mismo editor que publica.
- PostgreSQL bloquea la publicación de versiones académicamente incompletas o incompatibles con v1. Las filas hijas quedan congeladas durante `review` y `published`; vuelven a ser editables al regresar a `draft` mediante una solicitud de cambios.
- Las pruebas cubren los caminos válidos y negativos, y las migraciones se verifican desde cero y desde el esquema anterior.

## 3. Evidencia de integración y despliegue

| Evidencia | Resultado |
|---|---|
| [PR #75 — contrato y validador](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/pull/75) | Fusionada |
| [PR #77 — importador transaccional](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/pull/77) | Fusionada |
| [PR #78 — exportación y flujo editorial](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/pull/78) | Fusionada |
| [PR #79 — integridad de publicación e inmutabilidad](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/pull/79) | Fusionada |
| [CI #308 — validación final de PR #79](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/actions/runs/44262609878) | Correcto |
| [CI #309 — commit integrado en main](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/actions/runs/44264958977) | Correcto |
| [Deploy #46 — Ubuntu/systemd](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/actions/runs/44265858198) | Correcto |

El commit desplegado en producción es `bb5dd06dcb1956333c1bfcc2357096695ade598f`.

El CI #309 completó las rutas de migración fresh/upgrade, las pruebas de importación/exportación/editorial, el build Rust, Clippy y los tests Rust con cobertura. El despliegue #46 construyó el paquete de producción, verificó SHA-256, transfirió por Tailscale, activó los servicios systemd, aplicó las 15 migraciones SQL (incluida `20261118040000`) y pasó los health checks HTTP y el smoke funcional de Cloudflare TTS.

## 4. Comandos de verificación reproducible

Desde la raíz del repositorio:

```bash
python3 tools/curriculum/validate_content_package.py \
  tests/fixtures/curriculum/phase1_3_content_package_v1.json

python3 -m unittest discover \
  -s tools/curriculum/tests -p 'test_*.py' -v

DATABASE_URL='postgresql://…' \
  node --test tools/curriculum/tests/*.test.mjs

TEST_DATABASE_URL='postgresql://…' \
  bash scripts/test-phase1-2-migrations.sh
```

Las dos últimas verificaciones requieren una base PostgreSQL de pruebas aislada y con las migraciones aplicadas, según el flujo de CI.

## 5. Límites y operación posterior

El despliegue confirmó las migraciones y los health checks de la aplicación. No ejecutó una importación de contenido real en la base de producción: para esa operación se necesita un paquete curricular de negocio aprobado, referencias externas existentes y un UUID de editor provisionado en `content_editors`. La primera importación persistente debe ejecutarse explícitamente con `--apply` después de validar con dry-run y revisar el paquete; no se debe usar el fixture de CI como contenido real.

Quedan fuera del alcance de 1.3:

- **Subfase 1.4:** curación lingüística, traducciones, ejemplos, fonética, audios y expansión del catálogo.
- **Subfase 1.5:** APIs y pantallas de administración para operar el catálogo desde la interfaz.
- **Fase 2:** contrato de actividades, ejercicios y respuestas.

## 6. Decisión de cierre

Se acepta la subfase 1.3 como **completada en su alcance técnico**: sus entregables están integrados en `main`, las pruebas de aceptación automatizadas pasan y las migraciones/cambios de runtime están desplegados en la VM de producción. La carga editorial del primer paquete real queda como operación controlada del equipo de contenido, no como un bloqueo de implementación de esta subfase.
