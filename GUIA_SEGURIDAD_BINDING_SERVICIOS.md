# Bindings de red para DevFluency

## Valor predeterminado

Los procesos HTTP y gRPC deben escuchar en loopback de forma predeterminada. Esto evita exponer accidentalmente sus puertos a otras máquinas cuando se ejecutan directamente en un host de desarrollo. Este control reduce la superficie de red, pero **no sustituye la autenticación/autorización de gRPC ni TLS/mTLS**.

## Configuración explícita

Se pueden configurar las direcciones de escucha mediante estas variables:

| Servicio | Variable | Predeterminado |
| --- | --- | --- |
| BFF HTTP | `BFF_HTTP_BIND_ADDR` | `127.0.0.1:8080` |
| Auth Identity | `AUTH_SERVICE_BIND_ADDR` | `127.0.0.1:50051` |
| Content Vocabulary | `CONTENT_SERVICE_BIND_ADDR` | `127.0.0.1:50052` |
| AI Evaluator | `AI_SERVICE_BIND_ADDR` | `127.0.0.1:50053` |
| Phonetic Audio | `PHONETIC_SERVICE_BIND_ADDR` | `127.0.0.1:50054` |
| SRS Engine | `SRS_SERVICE_BIND_ADDR` | `127.0.0.1:50055` |
| Gamification Progress | `GAMIFICATION_SERVICE_BIND_ADDR` | `127.0.0.1:50056` |

Antes de configurar una dirección no-loopback (por ejemplo, `0.0.0.0`) en un despliegue, asegúrate de limitar el acceso mediante la red privada/firewall y de tener autenticación de servicio y transporte cifrado adecuados. No expongas directamente endpoints gRPC sensibles a redes no confiables.

## Pruebas

La función común de análisis de direcciones incluye pruebas unitarias para el valor predeterminado loopback, override explícito y direcciones malformadas. La ejecución real de las pruebas debe quedar registrada por CI antes de aprobar el cambio.
