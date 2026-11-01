# ADR-0004 — Adaptadores de proveedores de IA conversacional

- Estado: **Proposed**
- Fecha: 2026-11-01
- Fase: 0.3
- Decisores: pendiente de aprobación.

## Contexto

El servicio AI actual es un evaluador de texto basado en AWS Bedrock. El servicio de audio tiene TTS configurable entre AWS Polly y Cloudflare Workers AI. El reconocimiento de voz actual usa AWS Transcribe Streaming. No se encontró un dominio de conversación multi-turno, historial de turnos o tutor de escenarios.

TTS, STT, evaluación y tutor conversacional son responsabilidades diferentes y no deben compartir un selector ambiguo.

## Decisión propuesta

1. Definir una interfaz de dominio de tutor/conversación independiente del proveedor.
2. Proveer adaptadores reales para Cloudflare Workers AI y AWS Bedrock bajo el mismo contrato.
3. Seleccionar exclusivamente mediante `CONVERSATIONAL_AI_PROVIDER=cloudflare|aws`.
4. Mantener independientes:
   - `TTS_PROVIDER` para síntesis de voz.
   - Configuración STT para transcripción.
   - El proveedor del evaluador, si se separa del tutor.
5. No asumir que la selección conversacional modifica TTS o STT.
6. Validar configuración al iniciar, clasificar errores, definir timeouts, límites y observabilidad propios.
7. No realizar fallback silencioso de un proveedor a otro: una falla debe ser visible y medible.
8. Mantener prompts/contexto y datos personales mínimos, según ADR-0006.

## Contrato mínimo a definir

- Identificador de conversación y turno.
- Mensajes/roles y contexto de escenario.
- Nivel objetivo, idioma y objetivos pedagógicos.
- Respuesta streaming/no streaming según capacidad.
- Tokens/uso/latencia/modelo/proveedor.
- Errores: configuración, auth, cuota, timeout, upstream y respuesta inválida.
- Cancelación, límite de contexto y cierre de conversación.
- Idempotencia/correlación cuando corresponda.

## Alternativas consideradas

- Hacer que `TTS_PROVIDER` elija todo proveedor IA: rechazado; mezcla canales distintos.
- Acoplar el dominio al SDK Bedrock: rechazado; impide intercambiar proveedor.
- Usar un solo servicio de evaluación como tutor conversacional: rechazado; cambia semántica y privacidad.
- Fallback automático no visible: rechazado; impide saber con qué proveedor se procesó el turno.

## Consecuencias

- Se requieren tests de contrato comunes y suites por adaptador.
- Los secretos deben existir solo en entorno y no aparecer en logs.
- Deben medirse coste, latencia, errores, cuotas y límites por proveedor.
- La arquitectura actual no debe anunciar tutor Cloudflare/AWS hasta completar implementación real.

## Referencias

- [Roadmap maestro](../roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
- [Documentación actual TTS](../tts-providers.md)
