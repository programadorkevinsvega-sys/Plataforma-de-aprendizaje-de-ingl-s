# Fase 0: fixtures y datos sintéticos

## Fixtures versionados

- `tests/fixtures/phase0/personas.json`: perfiles de estudiante sintéticos para A0, A1, A2, B2 y C1, incluido un usuario sin actividad.
- `tests/fixtures/phase0/content.json`: vocabulario y frases de ejemplo con identificadores estables.
- Todos los identificadores y correos son ficticios. No se guardan datos de personas reales ni credenciales.

## Generar dataset reproducible

Desde la raíz del repositorio:

```sh
python3 tools/phase0/generate_synthetic_data.py --count 1000 --seed 20261102
```

El resultado por defecto se escribe en `artifacts/phase0/synthetic-users.jsonl`.
La misma semilla y los mismos fixtures producen el mismo contenido byte a byte.

El generador no se conecta a PostgreSQL, no llama servicios externos y no
inserta datos. El dataset debe cargarse únicamente en una base desechable o
un entorno de staging autorizado mediante un seeder explícito y revisado.

## Pruebas

```sh
python3 -m unittest discover -s tools/phase0/tests -p 'test_*.py' -v
```

## Prueba de carga de disponibilidad

`tests/load/bff-health-smoke.js` ofrece un perfil k6 de disponibilidad para
staging. Requiere `BASE_URL` y rechaza expresamente el hostname de producción.
No fija umbrales de latencia/p95 hasta obtener mediciones repetibles.
