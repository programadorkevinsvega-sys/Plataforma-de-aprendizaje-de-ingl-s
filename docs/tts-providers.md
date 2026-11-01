# Proveedores de síntesis de voz (TTS)

El endpoint público conserva el contrato:

\`POST /api/v1/content/speech\`

El flujo de síntesis es:

\`Next.js → BFF (Axum) → gRPC → phonetic-audio-service → TtsProvider\`

El BFF valida identidad, texto, voz, velocidad y límite de 20 solicitudes por usuario cada 60 segundos. No incluye SDK de Polly ni cliente de Cloudflare. El microservicio de audio carga un único proveedor al arrancar; no hay fallback automático.

## Selección

La variable se lee del entorno del proceso de audio:

\`\`\`dotenv
TTS_PROVIDER=aws
\`\`\`

Valores admitidos: \`aws\` o \`cloudflare\`. Si no existe, el valor predeterminado es \`aws\`. Cualquier otro valor detiene el arranque con un error de configuración. Los cambios requieren reiniciar \`devfluency@phonetic-audio-service\`, no recompilar frontend ni binarios.

## AWS Polly

\`\`\`dotenv
TTS_PROVIDER=aws
AWS_REGION=us-east-1
AWS_POLLY_VOICE_ID=Matthew
\`\`\`

Usa AWS SDK for Rust, Polly Neural y MP3. Los valores de velocidad se envían mediante SSML \`prosody\`, incluidos \`x-slow\`, \`slow\`, \`medium\` y \`fast\`. El audio ya sale modificado de Polly, por lo que \`playback_rate\` en la respuesta vale \`1.0\`.

En EC2 se recomienda asociar un IAM Instance Profile con \`polly:SynthesizeSpeech\` limitado a los recursos/región necesarios. No se necesitan access keys estáticas. \`AWS_REGION\` también se utiliza por AWS Transcribe.

## Cloudflare Workers AI

\`\`\`dotenv
TTS_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_TTS_MODEL_EN=@cf/deepgram/aura-2-en
CLOUDFLARE_TTS_MODEL_ES=@cf/deepgram/aura-2-es
CLOUDFLARE_TTS_SPEAKER_EN=luna
CLOUDFLARE_TTS_SPEAKER_ES=aquila
CLOUDFLARE_TTS_TIMEOUT_SECONDS=30
\`\`\`

El API Token debe tener permiso Workers AI Read para la cuenta. La llamada usa HTTPS y
\`Authorization: Bearer\`; el token nunca cruza al navegador. La API REST recibe el cuerpo de
entrada específico del modelo (\`text\`, \`speaker\`, \`encoding: mp3\`) en
\`POST /client/v4/accounts/{account_id}/ai/run/{model_id}\`.

El microservicio identifica la voz lógica:
- \`Lupe\`, \`Mia\`, \`Lucia\`, \`Enrique\`, \`Conchita\`: modelo español Aura-2 ES y speaker español configurado.
- Otras voces lógicas soportadas por el frontend: Aura-2 EN y speaker inglés configurado.

Las voces/speakers de Deepgram no tienen equivalencia garantizada con nombres AWS. Las listas de
speakers se validan contra las opciones documentadas en Aura-2. El resultado REST \`result.audio\`
es Base64 de MP3; el servicio lo decodifica, valida cabecera MP3 y vuelve a codificar al contrato
Base64 que ya consume el frontend. También tolera una respuesta MP3 binaria.

Aura-2 no recibe SSML ni parámetros de velocidad usados por Polly. Para Cloudflare, la respuesta
incluye \`playback_rate\` y el navegador aplica el factor una única vez al reproducir el MP3:
\`x-slow=0.65\`, \`slow=0.8\`, \`medium=1.0\`, \`fast=1.15\`. Son factores de reproducción elegidos
por la aplicación y no parámetros nativos del modelo.

## HTTP y gRPC contracts

El BFF mantiene el endpoint y los campos existentes:
\`audio_base64\`, \`format\`, \`voice\`, \`text\`.
Se añaden \`provider\`, \`model\` y \`playback_rate\`.

El proto conserva los campos existentes (incluido \`SynthesizeResponse.audio_base64 = 1\`) y
añade los nuevos campos con números libres. El cliente gRPC del BFF apunta a
\`PHONETIC_SERVICE_GRPC_URL\` (por defecto \`http://127.0.0.1:50054\`).

## AWS Transcribe / STT separado

\`TTS_PROVIDER=cloudflare\` evita que una solicitud de TTS requiera credenciales AWS. La función
de transcripción por WebSocket sigue usando AWS Transcribe y necesita las credenciales/permisos
correspondientes. No se migra STT ni se cambia su protocolo en este trabajo.

## Errores y observabilidad

- Configuración de proveedor/modelos/speakers inválida: el proceso no inicia.
- Solicitud inválida: gRPC INVALID_ARGUMENT; BFF HTTP 400.
- Límite del proveedor: gRPC RESOURCE_EXHAUSTED; BFF HTTP 429.
- Timeout: gRPC DEADLINE_EXCEEDED; BFF HTTP 503.
- Autenticación upstream o disponibilidad del proveedor: BFF HTTP 503.
- Otros fallos upstream: BFF HTTP 502.

Los logs informan proveedor, modelo, tipo de fallo, duración, estado upstream cuando existe e
ID de correlación. No registran token, Base64 ni texto completo. La inicialización no invoca
el proveedor; un proceso escuchando en el puerto gRPC solo demuestra que está activo, no que
puede sintetizar.

## Despliegue Ubuntu

Agregar las variables del proveedor elegido en:

\`/etc/apps/plataforma-aprendizaje/plataforma-aprendizaje.env\`

No guardar secretos en GitHub Actions ni en el repositorio. Después de desplegar los binarios:

\`\`\`bash
sudo systemctl restart 'devfluency@phonetic-audio-service'
sudo systemctl restart 'devfluency@bff'
sudo systemctl status 'devfluency@phonetic-audio-service' 'devfluency@bff' --no-pager
sudo journalctl -u 'devfluency@phonetic-audio-service' -f
\`\`\`

El pipeline existente continúa compilando Rust en GitHub Actions y copiando los binarios a Ubuntu.
No se introduce Docker. Esta implementación no ejecuta cambios sobre la VM ni edita el entorno
de producción.
