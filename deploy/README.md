# Despliegue automático de Plataforma de Aprendizaje en Ubuntu (sin Docker)

El workflow `.github/workflows/deploy-ubuntu.yml` construye y despliega **únicamente esta aplicación** cuando el workflow **CI** termina correctamente para `main`. También permite reintentar manualmente desde Actions sobre `main`.

## Alcance y aislamiento

- Directorio exclusivo de esta aplicación: `/opt/apps/plataforma-aprendizaje`.
- Releases versionadas por SHA: `/opt/apps/plataforma-aprendizaje/releases/<sha>`.
- Enlace activo: `/opt/apps/plataforma-aprendizaje/current`.
- Configuración exclusiva: `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env`.
- Usuario de proceso: `devfluency`.
- Unidades systemd: `devfluency@*.service`, `devfluency.target` y `devfluency-frontend.service`.

El script remoto solo administra esas rutas y unidades. No instala, reinicia ni modifica PostgreSQL, Redis, NATS ni otras aplicaciones alojadas en la VM. Las conexiones de datos se configuran mediante endpoints privados en el archivo de entorno de esta aplicación.

## Qué hace el pipeline

1. Espera que CI finalice correctamente en `main`.
2. Checkout del SHA exacto validado por CI.
3. Compila los siete ejecutables Rust con `cargo build --workspace --release --locked`.
4. Compila Next.js en modo `standalone`.
5. Empaqueta los binarios, frontend y scripts de despliegue.
6. Conecta el runner a la tailnet mediante `TAILSCALE_AUTHKEY`.
7. Transfiere el paquete por SSH a la IP Tailscale/MagicDNS de la VM.
8. Instala/configura las unidades systemd de esta aplicación.
9. Crea una release versionada, cambia el enlace `current` y reinicia solo los servicios de Plataforma.
10. Comprueba los siete servicios Rust, los puertos gRPC/BFF y los endpoints HTTP.
11. Si falla el reinicio o una comprobación, restaura la release anterior y reinicia los servicios de esta aplicación.

No instala Docker ni compila Rust en la VM. No despliega PostgreSQL, Redis ni NATS.

## Secrets requeridos

El job de despliegue usa el GitHub Environment `production`. Configura los siguientes secrets en **Settings → Environments → production → Environment secrets** (o como repository secrets si la política del repositorio lo permite):

- `TAILSCALE_AUTHKEY`: auth key de Tailscale. Preferir una clave efímera, etiquetada y restringida por ACL/grants a la VM de despliegue.
- `DEPLOY_HOST`: IP Tailscale `100.x.y.z` o nombre MagicDNS de la VM. No usar una IP pública ni asumir que la IP privada VPC es enrutable desde el runner.
- `DEPLOY_USER`: usuario SSH autorizado para ejecutar el script de despliegue mediante sudo.
- `DEPLOY_SSH_KEY`: clave privada correspondiente a la clave pública instalada en `authorized_keys`.
- `DEPLOY_KNOWN_HOSTS`: clave de host SSH verificada de forma independiente para el host indicado en `DEPLOY_HOST`.

El workflow valida que `TAILSCALE_AUTHKEY` no esté vacío antes de invocar la acción Tailscale. Nunca pegues el valor de la auth key en el repositorio, issues o conversaciones.

## Configuración de aplicación en la VM

El bootstrap crea `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env` solo si no existe, con permisos `0640` y propietario `root:devfluency`. Completar al menos:

- `DATABASE_URL`: PostgreSQL por IP/DNS privado de VPC.
- `JWT_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `REDIS_URL` y `NATS_URL`: endpoints privados si los servicios los requieren.
- `CORS_ALLOWED_ORIGINS`: origen público real del frontend.
- Variables AWS necesarias; preferir IAM instance profile para AWS en vez de claves estáticas.

No guardar secretos en Git. Los servicios gRPC y BFF se enlazan a loopback por defecto; el frontend escucha en `127.0.0.1:3000` para el reverse proxy.

### Migración desde la ruta anterior

Si existe una instalación previa en `/opt/devfluency` y `/etc/devfluency/devfluency.env`, el bootstrap copia las releases existentes y migra el archivo de entorno a la nueva ruta de esta aplicación, sin borrar ni sobrescribir el origen. Revisar la configuración migrada antes del primer despliegue.

Después de completar el archivo de entorno, ejecutar **Actions → Deploy Ubuntu (systemd) → Run workflow** sobre `main`.

## Servicios systemd administrados

- `devfluency@auth-identity-service`
- `devfluency@content-vocabulary-service`
- `devfluency@ai-evaluator-service`
- `devfluency@phonetic-audio-service`
- `devfluency@srs-engine-service`
- `devfluency@gamification-progress-service`
- `devfluency@bff`
- `devfluency-frontend`

Comandos útiles: `systemctl status devfluency.target`, `systemctl status 'devfluency@bff'`, `journalctl -u 'devfluency@bff' -f` y `journalctl -u devfluency-frontend -f`.

## Límites deliberados

- Las migraciones SQL no se ejecutan automáticamente: necesitan una estrategia idempotente y compatible con rollback.
- El despliegue no modifica los servicios de datos ni otras aplicaciones de la VM.
- La IP/hostname y los secretos no se inventan ni se escriben en el repositorio.
- El pipeline despliega solo tras CI exitoso; el workflow manual permite reintentar en `main`.
