# Despliegue automático de Plataforma de Aprendizaje en Ubuntu (sin Docker)

El workflow `.github/workflows/deploy-ubuntu.yml` construye y despliega **únicamente esta aplicación** cuando el workflow **CI** termina correctamente para `main`. El reintento manual desde Actions sobre `main` también exige localizar una ejecución CI de tipo `push`, exitosa y correspondiente al **mismo SHA exacto**; además, su clasificador debe indicar `run_deploy=true`. El evento manual no omite CI ni permite desplegar cambios que CI clasificó como no desplegables.

## Alcance y aislamiento

- Directorio exclusivo de esta aplicación: `/opt/apps/plataforma-aprendizaje`.
- Releases versionadas por SHA: `/opt/apps/plataforma-aprendizaje/releases/<sha>`.
- Enlace activo: `/opt/apps/plataforma-aprendizaje/current`.
- Configuración común sin el secreto TTS: `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env`.
- Configuración privada de audio: `/etc/apps/plataforma-aprendizaje/phonetic-audio-service.env` (root:root, permisos `0600`).
- Usuarios de proceso: `devfluency` para los servicios Rust generales y `devfluency-phonetic` exclusivamente para `phonetic-audio-service`.
- Unidades systemd: `devfluency@*.service`, `devfluency.target` y `devfluency-frontend.service`.

El script remoto solo administra esas rutas y unidades. No instala, reinicia ni modifica PostgreSQL, Redis, NATS ni otras aplicaciones alojadas en la VM. Las conexiones de datos se configuran mediante endpoints privados en el archivo de entorno de esta aplicación.

## Qué hace el pipeline

1. Espera que CI finalice correctamente en `main`.
2. Checkout del SHA exacto validado por CI.
3. Compila los siete ejecutables Rust de servicio y el cliente auxiliar `tts-smoke-test` con `cargo build --workspace --release --locked`.
4. Instala SQLx CLI 0.8.6 en el runner de CI.
5. Compila Next.js en modo `standalone`.
6. Empaqueta los binarios de servicio, el cliente de smoke test, SQLx CLI, frontend, scripts de despliegue y todos los archivos SQL de `migrations/`.
7. Genera un SHA-256 del paquete y lo verifica en el runner antes de transferirlo.
8. Conecta el runner a la tailnet mediante `TAILSCALE_AUTHKEY` usando una revisión completa e inmutable de Tailscale GitHub Action v4.
9. Transfiere el paquete y su checksum por SSH a la VM Ubuntu; la VM vuelve a verificar el checksum **antes de extraer**.
10. Verifica que `DATABASE_URL` apunte exactamente a `aprendizaje_ingles` y ejecuta `sqlx migrate run` con el registro de migraciones `_sqlx_migrations`.
11. Solo si todas las migraciones terminan correctamente, cambia el enlace `current`, reinicia los servicios systemd y comprueba puertos y endpoints HTTP.
12. Ejecuta una síntesis TTS real y breve contra el proveedor configurado, validando proveedor, modelo, formato y contenido de audio.
13. Si una migración falla, aborta antes de cambiar la release activa o reiniciar servicios. Si falla la activación, un health check o el smoke test funcional, restaura la release anterior.

SQLx registra las migraciones aplicadas y sus checksums; los despliegues posteriores ejecutan únicamente las migraciones pendientes y detectan cambios en migraciones ya aplicadas. El comando se ejecuta desde la VM de aplicación contra PostgreSQL por la conexión privada configurada, no dentro de Docker ni en la VM de PostgreSQL.

No instala Docker ni compila Rust en la VM. No despliega PostgreSQL, Redis ni NATS.

## Requisitos de base de datos

- `DATABASE_URL` debe apuntar a la base `aprendizaje_ingles`.
- El usuario de esa conexión debe tener permisos para crear y alterar los objetos del esquema de la aplicación y para crear la tabla de control `_sqlx_migrations`. Si el usuario runtime no tiene permisos DDL, configura un usuario de migraciones con esos permisos en `DATABASE_URL` durante el despliegue; no uses un usuario sin privilegios esperando que SQLx pueda crear el esquema.
- Las migraciones de esquema deben ser compatibles hacia delante con la versión anterior durante un despliegue. SQLx no revierte automáticamente cambios de esquema si una comprobación posterior obliga a volver a la release anterior.
- Antes de la primera migración en producción, conserva un respaldo verificable de `aprendizaje_ingles`.

## Secrets requeridos

El job de despliegue usa el GitHub Environment `production`. Configura los siguientes secrets en **Settings → Environments → production → Environment secrets** (o como repository secrets si la política del repositorio lo permite):

- `TAILSCALE_AUTHKEY`: auth key de Tailscale. Preferir una clave efímera, etiquetada y restringida por ACL/grants a la VM de despliegue.
- `DEPLOY_HOST`: IP Tailscale `100.x.y.z` o nombre MagicDNS de la VM. No usar una IP pública ni asumir que la IP privada VPC es enrutable desde el runner.
- `DEPLOY_USER`: usuario SSH autorizado para ejecutar el script de despliegue mediante sudo.
- `DEPLOY_SSH_KEY`: clave privada correspondiente a la clave pública instalada en `authorized_keys`.
- `DEPLOY_KNOWN_HOSTS`: clave de host SSH verificada de forma independiente para el host indicado en `DEPLOY_HOST`.

El workflow valida que `TAILSCALE_AUTHKEY` no esté vacío antes de invocar la acción Tailscale. Nunca pegues el valor de la auth key en el repositorio, issues o conversaciones.

## Configuración de aplicación en la VM

El bootstrap crea `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env` solo si no existe, con permisos `0640` y propietario `root:devfluency`. Ese archivo contiene configuración común, pero no debe contener `CLOUDFLARE_API_TOKEN` ni las variables específicas del proveedor TTS. El bootstrap crea además `phonetic-audio-service.env` con propietario `root:root` y permisos `0600`; solo `systemd` y root pueden leer el archivo. Completar al menos:

- `DATABASE_URL`: PostgreSQL por IP/DNS privado de VPC, apuntando a `aprendizaje_ingles` y usando un rol con permisos DDL para las migraciones.
- `JWT_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `REDIS_URL` y `NATS_URL`: endpoints privados si los servicios los requieren.
- `CORS_ALLOWED_ORIGINS`: origen público real del frontend.
- Variables AWS necesarias; preferir IAM instance profile para AWS en vez de claves estáticas.

No guardar secretos en Git. Los servicios gRPC y BFF se enlazan a loopback por defecto; el frontend escucha en `127.0.0.1:3000` para el reverse proxy.

### Migración desde la ruta anterior y separación de secretos

Si existe una instalación previa en `/opt/devfluency` y `/etc/devfluency/devfluency.env`, el bootstrap copia las releases existentes y migra el archivo de entorno a la nueva ruta de esta aplicación, sin borrar ni sobrescribir el origen. Durante el bootstrap también mueve las variables de TTS/STT que encuentre en el archivo común hacia `phonetic-audio-service.env`, y las elimina del archivo común. Si ambos archivos ya definen una variable, prevalece el valor del archivo dedicado.

El servicio de audio se ejecuta como `devfluency-phonetic`; los demás servicios Rust siguen usando `devfluency`. La unidad de audio carga `phonetic-audio-service.env` como archivo de entorno de su instancia, no como configuración global. El archivo es `root:root 0600`, por lo que los otros procesos no pueden leerlo. Revisar la configuración común y la de audio antes del primer despliegue.

Después de completar los archivos de entorno y verificar los permisos DDL del usuario de base de datos, el despliegue automático se habilita al hacer push a `main` tras CI exitoso. **Actions → Deploy Ubuntu (systemd) → Run workflow** sirve solo como reintento y también exige CI push exitoso para el mismo SHA y clasificación `run_deploy=true`.

## Configuración del proveedor TTS

El proveedor de síntesis se carga al iniciar `devfluency@phonetic-audio-service`. Las variables `TTS_PROVIDER`, `CLOUDFLARE_API_TOKEN` y demás ajustes TTS viven exclusivamente en `/etc/apps/plataforma-aprendizaje/phonetic-audio-service.env`. Los demás microservicios Rust no cargan ese archivo ni ejecutan con el mismo usuario Linux. No es necesario recompilar ni modificar el frontend para cambiar el proveedor.

Para AWS Polly (predeterminado), configura en `phonetic-audio-service.env`:

```dotenv
TTS_PROVIDER=aws
AWS_POLLY_VOICE_ID=Matthew
AWS_POLLY_TIMEOUT_SECONDS=30
AWS_TRANSCRIBE_LANGUAGE_CODE=en-US
```

`AWS_REGION` permanece en el archivo común porque otros servicios también pueden consumir AWS; el servicio de audio lo hereda desde allí.

La VM debe tener un IAM Instance Profile con permisos `polly:SynthesizeSpeech` para las voces
y región utilizadas. El SDK de AWS usa su cadena estándar de credenciales; no se requieren
claves permanentes si EC2 tiene un IAM Role.

Para Cloudflare Workers AI, configura **solo en** `/etc/apps/plataforma-aprendizaje/phonetic-audio-service.env`:

```dotenv
TTS_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=valor_del_account_id
CLOUDFLARE_API_TOKEN=valor_del_token
CLOUDFLARE_TTS_MODEL_EN=@cf/deepgram/aura-2-en
CLOUDFLARE_TTS_MODEL_ES=@cf/deepgram/aura-2-es
CLOUDFLARE_TTS_SPEAKER_EN=luna
CLOUDFLARE_TTS_SPEAKER_ES=aquila
CLOUDFLARE_TTS_TIMEOUT_SECONDS=30
```

Usa el Account ID de la cuenta Cloudflare (32 caracteres), no el Zone ID. La aplicación valida la longitud sin imponer un formato hexadecimal no especificado por el esquema de Cloudflare.

Crea un API Token con permisos Workers AI Read y Workers AI Edit para la cuenta. El token se almacena únicamente
en el archivo dedicado de la VM con propietario `root:root` y permisos `0600`; nunca en el archivo
compartido, GitHub ni el frontend. El proceso de audio se ejecuta como `devfluency-phonetic`,
mientras que los demás microservicios ejecutan como `devfluency`. Aura-2 admite speakers propios por idioma: cambiar de proveedor conserva las voces
lógicas del frontend, pero no implica equivalencia acústica de voces AWS y Deepgram.

`TTS_PROVIDER=cloudflare` elimina la dependencia de credenciales AWS para solicitudes TTS.
AWS Transcribe Streaming continúa usando la cadena de credenciales AWS y sus permisos por
separado (`transcribe:StartStreamTranscription`); seleccionar Cloudflare no migra STT.

Tras desplegar los binarios y editar manualmente el archivo de entorno, reinicia solamente
el servicio de audio y el BFF:

```bash
sudo systemctl restart 'devfluency@phonetic-audio-service'
sudo systemctl restart 'devfluency@bff'
sudo systemctl status 'devfluency@phonetic-audio-service' 'devfluency@bff' --no-pager
sudo journalctl -u 'devfluency@phonetic-audio-service' -n 100 --no-pager
```

El arranque valida la configuración local, pero no demuestra conectividad con el proveedor. En cambio,
cada despliegue ejecuta después de la activación **una síntesis TTS real y breve** contra el proveedor
seleccionado. El cliente auxiliar gRPC verifica proveedor, modelo, formato MP3 y que se haya devuelto
un payload de audio no vacío; si falla, se activa el rollback de código. La solicitud consume una
operación/cuota del proveedor (y puede generar costo según el plan), por lo que el smoke test se
mantiene intencionalmente corto.

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

- El despliegue ejecuta migraciones SQL pendientes mediante SQLx y registra su versión/checksum.
- El despliegue no modifica los servicios de datos ni otras aplicaciones de la VM.
- La IP/hostname y los secretos no se inventan ni se escriben en el repositorio.
- El pipeline despliega solo tras CI exitoso. El workflow manual exige una ejecución CI de tipo `push`, exitosa y del mismo SHA, además de `run_deploy=true`.
- El clasificador de CI y `ci-result` deben coincidir: un job seleccionado debe terminar en `success`; uno no seleccionado debe quedar en `skipped`.
- El paquete de release se verifica con SHA-256 tanto en el runner como en la VM antes de extraerlo.
- El token Cloudflare TTS se carga solo en `phonetic-audio-service`, con usuario Linux dedicado y archivo `root:root 0600`.
