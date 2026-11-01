# ROADMAP Y ARQUITECTURA ENTERPRISE — DEVFLUENCY

> **Estado:** documento original sincronizado con la planificación vigente.
> **Última sincronización:** 2026-11-01.
> **Documento rector de ejecución:** [docs/roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md](docs/roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md).
> **Documento complementario de arquitectura:** [DOCUMENTO_MAESTRO_ARQUITECTURA_DEVFLUENCY.md](DOCUMENTO_MAESTRO_ARQUITECTURA_DEVFLUENCY.md).

---

## 1. Propósito y autoridad de este documento

Este archivo conserva la planificación enterprise original de DevFluency y su división histórica en seis grandes etapas, pero ya no funciona como un plan de ejecución independiente.

La planificación vigente del producto está organizada en **11 fases (Fase 0 a Fase 10)** en el documento rector. Este archivo resume esa planificación, explica cómo se relaciona con las seis fases originales y registra el estado observado de la implementación para evitar que una intención histórica se confunda con una capacidad terminada.

**Jerarquía documental obligatoria:**

1. **ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md:** fuente única para alcance, fases, subfases, tareas, criterios de aceptación, pruebas y Definition of Done.
2. **DOCUMENTO_MAESTRO_ARQUITECTURA_DEVFLUENCY.md:** especificación complementaria de visión pedagógica, arquitectura actual, contratos, datos, proveedores y arquitectura objetivo.
3. **Este documento:** vista ejecutiva y trazabilidad entre el roadmap original de seis fases y la planificación vigente.
4. **Guías técnicas y auditorías:** evidencia y procedimientos específicos; no sustituyen los criterios del roadmap rector.

Si aparece una diferencia entre este archivo y el roadmap rector, prevalece el roadmap rector y los documentos complementarios deben actualizarse para eliminar la diferencia.

## 2. Visión del producto

DevFluency debe evolucionar hacia una plataforma de aprendizaje de inglés general y profesional, con especialización en comunicación para desarrolladores y profesionales de tecnología.

La experiencia formativa debe ayudar al estudiante a:

- Iniciar desde Pre-A1/A0 y avanzar mediante una ruta compatible con el MCER/CEFR hasta C1, con una extensión C2 definida por objetivos propios.
- Aprender inglés general y, en paralelo, inglés profesional y tecnológico.
- Relacionar texto, sonido y significado mediante el Sistema Dual de Pronunciación para Hispanohablantes.
- Practicar lectura, escritura, comprensión auditiva, expresión oral e interacción.
- Recibir evaluación basada en evidencias adecuadas a cada competencia.
- Reforzar memoria con repetición espaciada.
- Recibir tutoría conversacional y recomendaciones adaptadas a sus objetivos.
- Comprender su dominio académico sin confundirlo con XP, monedas, rachas o clasificaciones.

El objetivo no es replicar literalmente otro producto, sino crear una plataforma con identidad propia, progresión demostrable y prácticas contextualizadas.

## 3. Estado real del producto en el repositorio

Los siguientes estados describen la evidencia de código y pruebas observada en la rama main al sincronizar este documento. No equivalen a una certificación de producción ni a la finalización de una fase.

| Área | Estado observado | Evidencia en el repositorio | Límite que debe respetarse |
|---|---|---|---|
| Workspace y servicios Rust | Implementado parcialmente | Workspace Cargo, BFF Axum, servicios Rust, contratos Protobuf/gRPC | La existencia y compilación de un servicio no prueban todos sus flujos operativos |
| Autenticación | Implementado parcialmente | Argon2id, JWT configurado mediante JWT_SECRET, perfiles autenticados, refresh tokens persistidos con hash, rotación y revocación en código | La implementación actual usa el algoritmo predeterminado de jsonwebtoken con secreto simétrico; no describirla como Ed25519. La seguridad integral debe seguir verificándose |
| Contenido | Implementado parcialmente | Servicio de vocabulario, semillas A0 y A1, frases de contexto y campos fonéticos | Hay 322 entradas A0 y 469 A1 en las semillas revisadas; no existe todavía el catálogo curricular completo de 5.000–8.000 términos ni todas las rutas A2–C2 |
| Sistema Dual de Pronunciación | Implementado parcialmente | Pantalla /learn, campos spanish_phonetic y spanish_phonetic_natural, controles de escucha lenta y natural, TTS configurable | El generador actual produce el mismo texto para los campos lento/natural; el contenido sembrado puede diferir, pero requiere validación editorial y fonética. La práctica no es una evaluación |
| TTS | Implementado en su flujo actual | phonetic-audio-service, selector TTS_PROVIDER con AWS Polly y Cloudflare Workers AI/Aura-2 | El proveedor se carga al iniciar y no existe fallback automático. Su selección es independiente de la IA conversacional |
| STT | Implementado en su flujo actual | AWS Transcribe Streaming mediante WebSocket | La transcripción es texto reconocido; no equivale a análisis acústico de pronunciación |
| Evaluación de entrevistas | Implementado parcialmente | ai-evaluator-service con AWS Bedrock, seis campos de puntuación, cálculo ponderado y detección de dos debilidades | La evaluación recibe texto transcrito o escrito. Actualmente no analiza el audio original para pronunciación ni pausas; sus métricas de listening, pronunciación y fluidez no deben tratarse como mediciones acústicas válidas |
| Evaluación escrita/hablada separada | Pendiente | La UI admite voz o texto, pero el endpoint de evaluación consume texto y rechaza audio no vacío | Faltan modalidades, rúbricas, resultados y evidencias independientes según el roadmap rector |
| SRS | Implementado parcialmente | Servicio Rust, SM-2, tarjetas, revisiones y pantallas de repaso | Falta integrarlo completamente con objetivos curriculares, retención medida y plan académico |
| Gamificación | Implementado parcialmente | XP, monedas, estadísticas, rachas, eventos idempotentes de progreso por palabra y pantallas asociadas | El nivel derivado de XP sigue existiendo; debe separarse del dominio académico real. Misiones, temporadas y economía completa no se consideran terminadas |
| Tutor conversacional | Pendiente como capacidad de producto | Existe evaluación de entrevistas mediante Bedrock | El evaluador de entrevistas no es el tutor conversacional con historial, escenarios, correcciones y selector Cloudflare/AWS definido en la Fase 5 del roadmap rector |
| Personalización | Implementado parcialmente | Perfil, dashboard y datos de progreso | No hay todavía un plan académico adaptativo completo basado en dominio confiable y disponibilidad |
| Frontend | Implementado parcialmente | Rutas de dashboard, aprendizaje, entrevista, resultado, drill, SRS, logros, leaderboard, perfil y configuración | Accesibilidad, UX integral, responsive, todos los estados y recorridos E2E deben validarse |
| Seguridad y RLS | Implementado parcialmente | JWT, autorización de perfil, contexto RLS; políticas sobre SRS, exámenes, estadísticas y eventos de progreso | No afirmar que todas las tablas sensibles están cubiertas ni que existe aislamiento completo sin la matriz de pruebas correspondiente |
| Redis y NATS | Infraestructura configurada; uso funcional no acreditado en todos los flujos | Compose, variables de entorno y dependencias del workspace | No describirlos como un bus de eventos o una caché activa de extremo a extremo hasta verificar productores, consumidores y casos de uso reales |
| CI/CD y despliegue | Implementado parcialmente | GitHub Actions, compilación de binarios Rust, frontend standalone, paquete de release, SQLx migrations y servicios systemd | El código del pipeline no sustituye la verificación de despliegue, rollback, backups, restauración y observabilidad en un entorno representativo |
| Producción y lanzamiento | No verificado de extremo a extremo | Scripts de despliegue, health checks y configuración operativa | No declarar preparación o lanzamiento de producción hasta cumplir Fase 9 y Fase 10 |

### 3.1. Evidencia de verificaciones históricas de las seis fases originales

Existen artefactos bajo **artifacts/verify/** que registran resultados PASSED para comprobaciones acotadas de las fases originales 1 a 5:

| Fase original | Comprobaciones registradas | Qué demuestra y qué no demuestra |
|---|---|---|
| 1 | Cargo workspace check, contratos Protobuf/gRPC y migración RLS | Verificación acotada de compilación/contratos/migración; no prueba producción, recuperación ni toda la seguridad |
| 2 | Compilación de auth-identity-service y BFF | Comprueba compilación de ambos componentes; no es una suite de pruebas E2E de autenticación |
| 3 | Dos pruebas unitarias del motor fonético y compilación de content-vocabulary-service | Comprueba dos ejemplos de transliteración y compilación; no valida todo el catálogo ni la calidad fonética |
| 4 | Dos pruebas unitarias de matriz de métricas y compilación del evaluador | Comprueba cálculo y selección de debilidades; no valida que las seis métricas tengan evidencia pedagógica suficiente ni que Bedrock mida audio |
| 5 | Dos pruebas SM-2 y una prueba de gamificación | Comprueba escenarios unitarios básicos; no valida retención, concurrencia o economía completa |
| 6 | No se encontró un artefacto equivalente en el árbol revisado | La fase original de carga/producción no puede considerarse acreditada por estos artefactos |

Estos resultados son históricos y limitados. No se deben convertir automáticamente en estado DONE de las fases nuevas. La evidencia vigente para cada fase debe estar enlazada a su requisito, implementación, prueba y CI, de acuerdo con el roadmap rector.

## 4. Cómo se conserva y transforma el roadmap original de seis fases

Las seis fases originales se mantienen como agrupaciones históricas y de trazabilidad. Sus periodos de semanas 1–12 dejan de ser compromisos de calendario y no constituyen el orden actual de ejecución.

| Fase original | Intención original | Fases vigentes relacionadas | Estado resumido |
|---|---|---|---|
| 1. Infraestructura base | Workspace Rust, persistencia, contratos, Redis y NATS | Fase 0, Fase 1 y Fase 9 | Parcial: la base existe; falta completar auditoría, modelo curricular, integración efectiva de dependencias y hardening |
| 2. Autenticación y seguridad | Registro, login, sesiones y autorización | Fase 0 y Fase 9 | Parcial: existen Argon2id, JWT y refresh tokens; faltan verificaciones integrales de seguridad, RLS y transporte |
| 3. Motor fonético y contenido | Vocabulario contextual, guía fonética y audio | Fase 1, Fase 2 y Fase 8 | Parcial: existen semillas, pantalla de aprendizaje y TTS; el catálogo y la distinción pedagógica/sonora lento-natural requieren completar validaciones |
| 4. Entrevistas y evaluador IA | Entrevista, evaluación y ejercicios de refuerzo | Fase 2, Fase 3 y Fase 5 | Parcial: existe un evaluador textual Bedrock; falta corregir evidencias y construir el tutor conversacional independiente |
| 5. SRS y gamificación | SM-2, XP, rachas, monedas y logros | Fase 4, Fase 6 y Fase 7 | Parcial: existen SM-2 y recompensas básicas; falta dominio académico fiable, personalización y gamificación sostenible completa |
| 6. Carga y producción | Rendimiento, monitoreo y despliegue | Fase 9 y Fase 10 | Parcial/no verificado: hay CI/CD y systemd; faltan pruebas de carga, recuperación, observabilidad y aceptación integral |

## 5. Plan de ejecución vigente: Fase 0 a Fase 10

La secuencia de abajo resume el roadmap rector. Los checklists completos, entregables y gates se mantienen exclusivamente en ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md.

| Fase vigente | Resultado que debe producir | Estado observado |
|---|---|---|
| 0. Descubrimiento, inventario y diseño técnico | Línea base funcional/técnica, ADR, trazabilidad, calidad y riesgos | Parcial: existe inventario y auditoría inicial; falta completar la matriz integral y las decisiones aprobadas |
| 1. Currículo, contenido y catálogo académico | Rutas general y tecnológica, niveles Pre-A1/A0–C1 y extensión C2, contenido validado y versionado | Parcial: hay semillas A0/A1 y servicio de contenido; falta el currículo completo, catálogo ampliado, revisión y versionado |
| 2. Motor de lecciones y ejercicios | Contrato reutilizable, familias de ejercicios, feedback y Sistema Dual de Pronunciación integrado | Parcial: hay flujos actuales de vocabulario, audio y entrevista; falta el motor general y completar la validación del Sistema Dual |
| 3. Diagnóstico, evaluación académica y dominio | Diagnóstico y dominio por competencia, con modalidades escrita y hablada separadas | Parcial con brecha crítica: el evaluador actual puntúa texto con seis métricas; no implementa aún las dos modalidades ni evidencia acústica real |
| 4. Repetición espaciada y memoria | Repaso vinculado al currículo y retención demostrable | Parcial: SM-2 y revisiones existen; falta integración y medición académica |
| 5. Tutor conversacional con proveedor intercambiable | Tutor contextual con adaptadores reales Cloudflare Workers AI/AWS Bedrock y selector propio | Pendiente: el evaluador Bedrock actual no cumple este alcance |
| 6. Personalización y recomendador | Plan diario/semanal explicable basado en objetivos, dominio y disponibilidad | Parcial: existen datos de perfil/progreso y dashboard, no el recomendador completo |
| 7. Gamificación y motivación sostenible | Recompensas justas, idempotentes y separadas del dominio académico | Parcial: existen recompensas básicas y ledger de progreso por palabra; falta el modelo completo y separar nivel académico |
| 8. Experiencia de usuario, interfaz y móvil | Flujos coherentes, responsive, accesibles y sin estados ficticios | Parcial: existen rutas principales; la aceptación visual/accesible y E2E queda pendiente |
| 9. Observabilidad, seguridad y operación | Seguridad, telemetría, resiliencia, backups, restauración, rendimiento, despliegue y rollback | Parcial/no verificado: CI y despliegue systemd existen; no se ha acreditado la operación completa |
| 10. Validación integral y lanzamiento | Piloto, recorridos E2E, regresión, gates y salida | Pendiente: no marcar como listo sin evidencias integrales |

## 6. Decisiones de producto y arquitectura que no deben volver a contradecirse

1. **Sistema Dual de Pronunciación:** se conserva como herramienta de enseñanza para hispanohablantes. La pronunciación lenta permite reconocer y practicar sonidos; la natural expone al estudiante al ritmo conversacional. No es un evaluador.
2. **Evaluación escrita y hablada:** son modalidades independientes con rúbricas y resultados propios. La escrita no otorga puntuación de pronunciación ni fluidez oral. La hablada usa grabación real y transcripción complementaria.
3. **Pronunciación y fluidez oral:** solo se califican cuando hay audio con calidad suficiente y análisis adecuado. La salida de STT por sí sola no prueba cómo se pronunció.
4. **Listening:** se mide con actividades de comprensión auditiva cuyo estímulo principal es el audio y que no revelan la transcripción antes de responder.
5. **Tutor conversacional y evaluador:** son capacidades distintas. El evaluador de entrevistas actual no equivale al tutor conversacional previsto.
6. **Proveedores independientes:** TTS usa TTS_PROVIDER con AWS o Cloudflare; STT actual utiliza AWS Transcribe; el tutor tendrá CONVERSATIONAL_AI_PROVIDER con Cloudflare o AWS según el roadmap rector. Cambiar un proveedor no debe cambiar los otros.
7. **Dominio académico y gamificación:** XP, monedas, rachas y niveles de juego no demuestran dominio CEFR.
8. **Microservicios:** se conservan los límites actuales y se prefieren módulos internos; un nuevo microservicio requiere ADR y justificación operacional.
9. **Despliegue:** producción compila binarios Rust y frontend en CI y despliega mediante release package/systemd en Ubuntu. Docker Compose puede servir para desarrollo local, pero Docker no es requisito de despliegue de las aplicaciones en las VMs. Kubernetes no es un objetivo aprobado por defecto.
10. **Redis y NATS:** su presencia en configuración o dependencias no autoriza a afirmar que todos los flujos ya los utilizan. Documentar integraciones solo con evidencia real de productor, consumidor y comportamiento.

## 7. Reglas de avance

- El roadmap rector es la única fuente para marcar tareas, subfases y fases como pendientes, en curso, bloqueadas, en revisión o terminadas.
- No cambiar una tarea a DONE por la existencia de una carpeta, endpoint, pantalla, interfaz, mock o test de humo.
- No declarar una fase terminada por compilar un binario o pasar una prueba unitaria aislada.
- Cada PR debe indicar fase/subfase, alcance, migraciones, contratos, pruebas, riesgos, compatibilidad, configuración y rollback.
- Las pruebas de IA deben ser deterministas en CI mediante dobles controlados; las llamadas reales a proveedores deben ser smoke tests opt-in.
- Los fallos de proveedores, dependencias o almacenamiento deben producir errores explícitos y recuperables, no puntuaciones ni datos inventados.
- No implementar cambios de alcance que contradigan las decisiones de producto de la sección 6 sin actualizar primero el roadmap rector y el documento arquitectónico.

## 8. Documentos relacionados

- [Roadmap maestro de implementación (fuente única de ejecución)](docs/roadmap/ROADMAP_PLATAFORMA_APRENDIZAJE_PROFESIONAL.md)
- [Documento maestro de arquitectura DevFluency](DOCUMENTO_MAESTRO_ARQUITECTURA_DEVFLUENCY.md)
- [Proveedores TTS](docs/tts-providers.md)
- [Auditoría inicial de seguridad](docs/audits/2026-10-28-initial-security-audit.md)
- [Excepciones de dependencias](docs/audits/2026-10-29-dependency-exceptions.md)

**Regla final:** la planificación original de seis fases queda preservada como historia y agrupación conceptual. La ejecución nueva, el progreso real y la aceptación del producto se controlan exclusivamente desde el roadmap maestro de Fase 0 a Fase 10.
