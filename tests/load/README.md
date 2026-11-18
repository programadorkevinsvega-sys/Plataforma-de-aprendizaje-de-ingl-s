# Pruebas de carga — Fase 0

El primer escenario es deliberadamente un smoke test de disponibilidad del BFF,
no una prueba de capacidad ni un SLO.

## Requisitos

- k6 instalado localmente.
- `BASE_URL` apuntando a un entorno staging aislado.
- No se permite usar el hostname de producción.
- No se crean usuarios ni se escriben datos.

## Ejecución

```sh
BASE_URL=https://staging.example.invalid VUS=2 DURATION=30s k6 run tests/load/bff-health-smoke.js
```

La prueba valida que `GET /health` responde HTTP 200. No establece umbrales
de latencia: primero hay que obtener p50/p95/p99 en staging con una carga
conocida. El dataset de identidades sintéticas se genera con
`tools/phase0/generate_synthetic_data.py`; no debe insertarse en producción.
