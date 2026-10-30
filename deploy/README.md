# Despliegue automático en Ubuntu sin Docker

El workflow `.github/workflows/deploy-ubuntu.yml` se ejecuta cuando el workflow **CI** termina correctamente en `main`. También permite un reintento manual desde Actions, limitado a `main`.

## Qué hace

1. Compila los siete ejecutables Rust en GitHub Actions con `cargo build --workspace --release --locked`.
2. Compila Next.js en modo `standalone`.
3. Empaqueta binarios y frontend como artefacto asociado al SHA exacto validado por CI.
4. Se conecta a la VM por Tailscale y SSH.
5. Instala Node.js 24 si hace falta, crea el usuario de sistema `devfluency`, instala las unidades systemd y crea el archivo de entorno de producción si aún no existe.
6. Instala la versión en un directorio versionado, cambia el enlace `current`, reinicia los servicios y verifica los puertos, el endpoint BFF y el frontend.
7. Si falla el health check, restaura el enlace a la versión anterior.

No instala Docker ni compila Rust en la VM.

## Secrets requeridos en GitHub

Configurar en **Settings → Secrets and variables → Actions → New repository secret**:

- `TAILSCALE_AUTHKEY`: clave de autenticación Tailscale efímera, preferiblemente restringida por tags/ACL a esta VM.
- `DEPLOY_HOST`: IP Tailscale o nombre DNS Tailscale de la VM de aplicaciones (no la IP privada VPC si el runner no puede enrutarla directamente).
- `DEPLOY_USER`: usuario SSH de Ubuntu autorizado para ejecutar sudo.
- `DEPLOY_SSH_KEY`: clave privada SSH correspondiente a una clave pública instalada en `~/.ssh/authorized_keys` de ese usuario.
- `DEPLOY_KNOWN_HOSTS`: línea(s) de clave pública del host SSH para ese host. Obtenerlas con `ssh-keyscan -H <host>` y verificar la huella por un canal independiente antes de guardarlas.

El usuario SSH debe poder ejecutar `sudo bash` sin interacción (el usuario predeterminado `ubuntu` de las AMI oficiales normalmente ya dispone de sudo sin contraseña). No almacenar claves privadas ni secretos de aplicación en el repositorio.

## Configuración de aplicación (una sola vez en Ubuntu)

El primer bootstrap crea `/etc/devfluency/devfluency.env` con permisos `0640`, propiedad `root:devfluency`. Antes del primer despliegue exitoso, editar ese archivo en la VM y establecer al menos:

- `DATABASE_URL`: URL PostgreSQL privada alcanzable desde la VM de aplicaciones.
- `JWT_SECRET`: secreto aleatorio fuerte de al menos 32 caracteres.
- `REDIS_URL` y `NATS_URL`: endpoints privados si los servicios los requieren.
- `CORS_ALLOWED_ORIGINS`: origen público real del frontend.
- `AWS_REGION` y credenciales AWS mediante IAM role de la instancia (recomendado) si se utilizan Polly, Transcribe o Bedrock.

Los servicios gRPC se enlazan a loopback por defecto porque BFF y microservicios corren en la misma VM. No exponer los puertos 50051-50056 públicamente. El frontend escucha en loopback:3000 para el reverse proxy.

Después de completar el archivo, ejecutar **Actions → Deploy Ubuntu (systemd) → Run workflow** sobre `main` para desplegar sin necesidad de crear otro commit.

## Servicios systemd

- `devfluency@auth-identity-service`
- `devfluency@content-vocabulary-service`
- `devfluency@ai-evaluator-service`
- `devfluency@phonetic-audio-service`
- `devfluency@srs-engine-service`
- `devfluency@gamification-progress-service`
- `devfluency@bff`
- `devfluency-frontend`

Comandos útiles: `systemctl status devfluency.target`, `systemctl status 'devfluency@bff'`, `journalctl -u 'devfluency@bff' -f`, `journalctl -u devfluency-frontend -f`.

## Límites deliberados

- Las migraciones SQL no se ejecutan automáticamente en este primer flujo; requieren una estrategia de migración idempotente y controlada antes de habilitarlas en producción.
- La IP/hostname de la VM y el archivo de entorno no se inventan ni se sobrescriben.
- El workflow solo despliega tras CI exitoso; el workflow manual sirve para reintentar el despliegue en `main`.
