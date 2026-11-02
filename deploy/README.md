# Despliegue automático de Plataforma de Aprendizaje en Ubuntu (sin Docker)

El workflow `.github/workflows/deploy-ubuntu.yml` construye y despliega **únicamente esta aplicación** cuando el workflow **CI** termina correctamente para `main`. También permite reintentar manualmente desde Actions sobre `main`, pero el dispatch manual exige que la ejecución push de CI más reciente para el mismo SHA haya terminado en `success`; no permite saltarse CI.

## Alcance y aislamiento

- Directorio exclusivo de esta aplicación: `/opt/apps/plataforma-aprendizaje`.
- Releases versionadas por SHA: `/opt/apps/plataforma-aprendizaje/releases/<sha>`.
- Enlace activo: `/opt/apps/plataforma-aprendizaje/current`.
- Configuración exclusiva: `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env`.
- Usuarios de proceso: `devfluency` para los servicios generales y `devfluency-audio` (grupo `devfluency`) para el microservicio de audio/TTS.
- Unidades systemd: `devfluency@*.service`, `devfluency.target` y `devfluency-frontend.service`.

El script remoto solo administra esas rutas y unidades. No instala, reinicia ni modifica PostgreSQL, Redis, NATS ni otras aplicaciones alojadas en la VM. Las conexiones de datos se configuran mediante endpoints privados en el archivo de entorno de esta aplicación.

## Qué hace el pipeline

1. Espera que CI finalice correctamente en `main`. El dispatch manual solo puede reintentar el SHA actual si la ejecución push de CI más reciente para ese mismo SHA terminó en `success`.
2. Checkout del SHA exacto validado por CI.
3. Compila los siete ejecutables Rust con `cargo build --workspace --release --locked`.
4. Instala SQLx CLI 0.8.6 en el runner de CI.
5. Compila Next.js en modo `standalone`.
6. Empaqueta los binarios, SQLx CLI, frontend, scripts de despliegue y todos los archivos SQL de `migrations/`; genera un SHA-256 del paquete.
7. Verifica el SHA-256 después de descargar el artefacto en el runner y otra vez en la VM por SSH, antes de extraerlo.
8. Conecta el runner a la tailnet con `tailscale/github-action` fijada por SHA completo y transfiere el paquete a la VM Ubuntu.
9. Verifica que `DATABASE_URL` apunte exactamente a `aprendizaje_ingles` y ejecuta `sqlx migrate run` con el registro de migraciones `_sqlx_migrations`.
10. Solo si todas las migraciones terminan correctamente, cambia el enlace `current`, reinicia los servicios systemd y comprueba puertos, BFF y frontend.
11. Ejecuta una síntesis real y breve con el proveedor TTS configurado. Si falla, el despliegue hace rollback a la release anterior.
12. Si una migración falla, aborta antes de cambiar la release activa o reiniciar servicios. Si falla la activación, un health check o el smoke test TTS, restaura la release anterior.

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

El workflow valida que `TAILSCALE_AUTHKEY` no esté vacío antes de invocar la acción Tailscale. La acción se fija a un SHA completo para evitar depender de una etiqueta mutable. Nunca pegues el valor de la auth key en el repositorio, issues o conversaciones.

## Configuración de aplicación en la VM

El bootstrap crea `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env` solo si no existe, con permisos `0640` y propietario `root:devfluency`. Completar al menos:

- `DATABASE_URL`: PostgreSQL por IP/DNS privado de VPC, apuntando a `aprendizaje_ingles` y usando un rol con permisos DDL para las migraciones.
- `JWT_SECRET`: secreto aleatorio de al menos 32 caracteres.
- `REDIS_URL` y `NATS_URL`: endpoints privados si los servicios los requieren.
- `CORS_ALLOWED_ORIGINS`: origen público real del frontend.
- Variables AWS necesarias; preferir IAM instance profile para AWS en vez de claves estáticas.
- Variables no secretas del proveedor TTS, como `TTS_PROVIDER`, `CLOUDFLARE_ACCOUNT_ID` y los modelos/speakers Cloudflare. El token Cloudflare se mantiene fuera de este archivo compartido.

No guardar secretos en Git. Los servicios gRPC y BFF se enlazan a loopback por defecto; el frontend escucha en `127.0.0.1:3000` para el reverse proxy.

### Migración desde la ruta anterior

Si existe una instalación previa en `/opt/devfluency` y `/etc/devfluency/devfluency.env`, el bootstrap copia las releases existentes y migra el archivo de entorno a la nueva ruta de esta aplicación, sin borrar ni sobrescribir el origen. Revisar la configuración migrada antes del primer despliegue.

Después de completar los archivos de entorno y verificar los permisos DDL del usuario de base de datos, puedes ejecutar **Actions → Deploy Ubuntu (systemd) → Run workflow** sobre `main` para reintentar. Ese dispatch únicamente construye y despliega cuando existe una ejecución push de CI exitosa para el SHA exacto actual de `main`.

## Configuración del proveedor TTS

El proveedor de síntesis se carga al iniciar `devfluency@phonetic-audio-service`. La configuración no secreta del proveedor sigue en `plataforma-aprendizaje.env`, pero el token de Cloudflare se carga desde un archivo separado que solo recibe la unidad systemd del microservicio de audio. No es necesario recompilar ni modificar el frontend para cambiar el proveedor.

Para AWS Polly (predeterminado):

```dotenv
TTS_PROVIDER=aws
AWS_REGION=us-east-1
AWS_POLLY_VOICE_ID=Matthew
AWS_POLLY_TIMEOUT_SECONDS=30
```

La VM debe tener un IAM Instance Profile con permisos `polly:SynthesizeSpeech` para las voces
y región utilizadas. El SDK de AWS usa su cadena estándar de credenciales; no se requieren
claves permanentes si EC2 tiene un IAM Role.

El token de Cloudflare va exclusivamente en
`/etc/apps/plataforma-aprendizaje/phonetic-audio-service.secrets`:

```dotenv
CLOUDFLARE_API_TOKEN=valor_del_token
```

El bootstrap migra automáticamente una variable `CLOUDFLARE_API_TOKEN` que encuentre en el
archivo compartido y la elimina de allí. El archivo dedicado queda como `root:root` con modo
`0600`; un drop-in de systemd lo carga únicamente en
`devfluency@phonetic-audio-service.service` y asigna a esa unidad la cuenta Unix
`devfluency-audio`. Ese microservicio usa el usuario Unix
`devfluency-audio`, distinto al usuario `devfluency` de los otros procesos. Los otros seis
servicios Rust no reciben ese secreto ni comparten su identidad de proceso. Para rotarlo,
actualiza ese archivo dedicado; no vuelvas a poner el token en el archivo compartido.

Para Cloudflare Workers AI, configura los valores no secretos en `/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env`:

```dotenv
TTS_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=valor_del_account_id
CLOUDFLARE_TTS_MODEL_EN=@cf/deepgram/aura-2-en
CLOUDFLARE_TTS_MODEL_ES=@cf/deepgram/aura-2-es
CLOUDFLARE_TTS_SPEAKER_EN=luna
CLOUDFLARE_TTS_SPEAKER_ES=aquila
CLOUDFLARE_TTS_TIMEOUT_SECONDS=30
```

Crea un API Token con permisos Workers AI Read y Workers AI Edit para la cuenta. El token se almacena únicamente
en el archivo de secretos dedicado de la VM con propietario/permisos restrictivos; nunca en GitHub ni en
el frontend. Aura-2 admite speakers propios por idioma: cambiar de proveedor conserva las voces
lógicas del frontend, pero no implica equivalencia acústica de voces AWS y Deepgram.

`TTS_PROVIDER=cloudflare` elimina la dependencia de credenciales AWS para solicitudes TTS.
AWS Transcribe Streaming continúa usando la cadena de credenciales AWS y sus permisos por
separado (`transcribe:StartStreamTranscription`); seleccionar Cloudflare no migra STT.

En cada despliegue, `DEPLOY_TTS_SMOKE_TEST` está activado por defecto y el pipeline hace una
síntesis real corta usando las credenciales y el proveedor configurados. Esto verifica credenciales,
conectividad y respuesta de audio, pero genera una llamada al proveedor y puede consumir cuota o
tener coste. Para omitirla de forma deliberada, agrega `DEPLOY_TTS_SMOKE_TEST=false` al archivo
compartido de configuración. No desactiva las comprobaciones de puertos ni HTTP.

Tras cambiar manualmente el proveedor o rotar el token, reinicia solamente el servicio de audio
y el BFF:

```bash
sudo systemctl restart 'devfluency@phonetic-audio-service'
sudo systemctl restart 'devfluency@bff'
sudo systemctl status 'devfluency@phonetic-audio-service' 'devfluency@bff' --no-pager
sudo journalctl -u 'devfluency@phonetic-audio-service' -n 100 --no-pager
```

El reinicio valida configuración local y construye el cliente; no realiza una síntesis remota.
La comprobación de puerto/health no demuestra conectividad ni síntesis real con el proveedor.
El servicio `devfluency-tts-smoke.service` es una unidad `oneshot` separada que ejecuta la
comprobación real con los mismos archivos de entorno, pero solo durante el despliegue.

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
- El pipeline despliega solo tras CI exitoso; el workflow manual permite reintentar en `main` únicamente con CI exitoso para el SHA exacto.
- La síntesis funcional TTS real se ejecuta una vez por despliegue, salvo que `DEPLOY_TTS_SMOKE_TEST=false`.
