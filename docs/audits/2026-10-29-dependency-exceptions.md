# Excepciones acotadas de RustSec — 29 de octubre de 2026

## Política

`cargo audit` revisa todos los paquetes representados en `Cargo.lock`, incluidos paquetes que solo existen como dependencias opcionales de crates transitivos. Una excepción de este archivo **no significa que el crate sea seguro** ni que la vulnerabilidad se haya corregido en upstream. Se permite únicamente cuando el control de dependencias activas del workflow demuestra que el paquete vulnerable no forma parte del grafo del workspace para Linux x86_64, con todos los targets del workspace.

La CI ejecuta el control de alcanzabilidad y falla si reaparece alguna versión listada abajo en `cargo tree --workspace --all-targets --target x86_64-unknown-linux-gnu`. Se ignoran IDs concretos, nunca severidades enteras, paquetes completos ni todos los avisos. Cualquier advisory nuevo sigue siendo un fallo de `cargo audit`.

## Excepciones

| Advisory | Paquete/versión afectada | Ruta registrada en lockfile | Impacto y motivo de excepción | Mitigación, evidencia y condición de revisión |
| --- | --- | --- | --- | --- |
| [RUSTSEC-2026-0258](https://rustsec.org/advisories/RUSTSEC-2026-0258.html) | `h2 0.3.27` | Dependencia opcional del conector heredado `hyper-014` de `aws-smithy-http-client` | Vulnerabilidad de manejo de DATA frames; la versión antigua se conserva en el lockfile para la feature opcional, pero dejó de estar en el grafo activo cuando se desactivó `rustls` en los tres clientes AWS directos. | `aws-sdk-bedrockruntime`, `aws-sdk-polly` y `aws-sdk-transcribestreaming` usan explícitamente `default-https-client` + `rt-tokio`. Verificación inicial: [workflow de grafo activo](https://github.com/programadorkevinsvega-sys/Plataforma-de-aprendizaje-de-ingl-s/actions/runs/40948480005). Retirar la excepción cuando el lockfile deje de contener la dependencia opcional o si aparece un path activo. |
| [RUSTSEC-2026-0349](https://rustsec.org/advisories/RUSTSEC-2026-0349.html) | `rustls 0.21.12` | TLS heredado de `hyper-014` | Riesgo de downgrade en conexiones posteriores; el paquete ya no aparece en el grafo activo después de deshabilitar los features `rustls` heredados. | Mismo control activo obligatorio. Revisar al actualizar el SDK AWS o si el guard falla. |
| [RUSTSEC-2026-0346](https://rustsec.org/advisories/RUSTSEC-2026-0346.html) | `rustls 0.21.12` | TLS heredado de `hyper-014` | La representación `Debug` de valores de sesión puede exponer secretos TLS; ruta inactiva. | Mismo control activo obligatorio y revalidación en cada PR. |
| [RUSTSEC-2026-0098](https://rustsec.org/advisories/RUSTSEC-2026-0098.html) | `rustls-webpki 0.101.7` | Dependencia opcional de `rustls 0.21.12` heredado | La validación de restricciones URI admite nombres que debería rechazar; la ruta no es alcanzable con el cliente HTTPS moderno seleccionado. | Mismo control activo obligatorio. Revisar si vuelve a aparecer `rustls 0.21`. |
| [RUSTSEC-2026-0099](https://rustsec.org/advisories/RUSTSEC-2026-0099.html) | `rustls-webpki 0.101.7` | Dependencia opcional de `rustls 0.21.12` heredado | La validación de restricciones URI para wildcard es defectuosa; ruta inactiva. | Mismo control activo obligatorio. |
| [RUSTSEC-2026-0382](https://rustsec.org/advisories/RUSTSEC-2026-0382.html) | `rustls-webpki 0.101.7` | Dependencia opcional de `rustls 0.21.12` heredado | La validación puede aceptar intermediarios revocados por distrust; ruta inactiva. | Mismo control activo obligatorio. |
| [RUSTSEC-2026-0104](https://rustsec.org/advisories/RUSTSEC-2026-0104.html) | `rustls-webpki 0.101.7` | Dependencia opcional de `rustls 0.21.12` heredado | Puede ocurrir un panic alcanzable procesando CRLs; ruta inactiva. | Mismo control activo obligatorio. |
| [RUSTSEC-2023-0071](https://rustsec.org/advisories/RUSTSEC-2023-0071.html) | `rsa 0.9.10` | Dependencia opcional de `sqlx-mysql 0.8.6`; el workspace declara SQLx con `default-features = false` y solo la feature `postgres`. | El crate presenta el ataque de timing Marvin y no hay versión parcheada upstream según RustSec (revisión del 14 de septiembre de 2026). No se habilita el driver MySQL, por lo que no forma parte del grafo activo. | Mantener SQLx en modo PostgreSQL-only; el guard de CI detecta `rsa 0.9.10` si se activa. Revaluar al actualizar SQLx o habilitar MySQL. No usar RSA para operaciones criptográficas expuestas a observadores remotos. |

## Decisión

Las excepciones cubren solo las versiones e IDs enumerados. No eliminan el deber de actualizar dependencias ni reemplazan la auditoría. La revisión del grafo activo debe seguir ejecutándose con cada PR; si alguno de los paquetes aparece en el grafo del workspace, el control falla independientemente de esta lista.
