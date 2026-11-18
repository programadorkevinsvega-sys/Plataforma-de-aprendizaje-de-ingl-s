# Fase 1.1 — Blueprint curricular de DevFluency

- **Estado:** propuesta curricular v1.0 para revisión del producto
- **Fase:** 1.1 — Definición del currículo
- **Fecha:** 2026-11-16
- **Marco de referencia:** MCER/CEFR, Companion Volume (2020)
- **Población primaria:** adultos hispanohablantes que necesitan inglés general y, en paralelo, inglés profesional/tecnológico
- **Alcance:** definición académica y editorial. No crea tablas, migraciones, endpoints ni contenido publicado.

## 1. Decisiones curriculares

1. DevFluency tendrá dos rutas relacionadas: **Inglés General** y **English for Technology & Professional Communication**.
2. La ruta general define la progresión lingüística desde **Pre-A1 (A0 interno)** hasta C1. **C2 será una extensión avanzada**, no una etiqueta de dominio automática ni una promesa de certificación.
3. La ruta tecnológica se alinea con el nivel general del estudiante, pero tiene objetivos, situaciones, vocabulario y evidencias propios. No reemplaza los fundamentos del inglés general.
4. El currículo se organiza en cursos, versiones, unidades, lecciones, objetivos observables y actividades. Cada objetivo se vincula con una evidencia y un criterio de logro.
5. Las competencias receptivas, productivas e interactivas se trabajan de forma integrada, pero sus evidencias y resultados se mantienen diferenciados: listening no se infiere de reading; speaking no se infiere de writing.
6. La progresión se define por lo que el estudiante puede hacer con el idioma en contextos reales, no por completar pantallas, acumular XP o memorizar listas.
7. Los niveles son **referencias curriculares internas alineadas con descriptores ilustrativos del MCER**. DevFluency no es un examen acreditado y no debe presentarse como certificador oficial del MCER.

El Companion Volume del Consejo de Europa incorpora Pre-A1 y amplía los descriptores de comprensión, competencia fonológica, mediación e interacción en línea, además de enriquecer la descripción de C1/C2. Este blueprint adopta esa amplitud sin copiar una escala oficial como si fuera una certificación del producto. Véanse las referencias del apartado 13.

## 2. Arquitectura de las dos rutas

### 2.1. Ruta de Inglés General

| Tramo | Propósito de progresión | Resultado global esperado |
|---|---|---|
| Pre-A1 / A0 interno | Construir supervivencia comunicativa inicial y familiaridad con sonidos, palabras y rutinas | Reconocer y utilizar expresiones muy frecuentes para dar información personal y responder a necesidades concretas con apoyo |
| A1 | Resolver intercambios simples y previsibles | Comprender y producir mensajes breves sobre personas, rutinas, lugares y necesidades inmediatas |
| A2 | Desenvolverse en tareas cotidianas y situaciones familiares | Participar en intercambios rutinarios, describir experiencias sencillas y expresar planes, preferencias y necesidades |
| B1 | Actuar con independencia en situaciones familiares | Comprender los puntos principales de mensajes claros y producir discurso conectado sobre temas conocidos, experiencias y planes |
| B2 | Participar con fluidez funcional y sostener argumentos | Comprender ideas principales y detalles relevantes de textos complejos, interactuar con espontaneidad y argumentar con claridad |
| C1 | Usar el idioma con flexibilidad en contextos académicos y profesionales | Comprender textos extensos y exigentes, captar significados implícitos y expresarse con fluidez, precisión y organización |
| C2 — extensión | Perfeccionar precisión, matiz, registro y síntesis | Interpretar y producir lenguaje complejo con control estilístico, pragmático y discursivo en casi cualquier situación |

**Pre-A1/A0:** Pre-A1 es la denominación del descriptor de referencia del Companion Volume. “A0” se usa únicamente como alias interno y pedagógico para orientar a estudiantes que comienzan desde cero; no es un nivel oficial adicional del MCER.

### 2.2. Ruta de inglés profesional y tecnológico

La ruta tecnológica se integra progresivamente. En Pre-A1 y A1 se presenta tecnología cotidiana como contexto de aprendizaje, pero no se exige competencia laboral técnica en inglés. La ruta profesional con objetivos propios comienza en A2.

| Nivel de referencia | Dominio contextual | Situaciones y tareas demostrables |
|---|---|---|
| Pre-A1 / A0 | Tecnología cotidiana | Reconocer nombres de dispositivos e iconos, seguir instrucciones digitales muy breves con apoyo visual |
| A1 | Vida digital y estudio | Nombrar dispositivos y acciones simples; decir qué herramienta usa; pedir ayuda con frases memorizadas |
| A2 | Herramientas y tareas | Explicar una tarea cotidiana, seguir instrucciones simples, describir un problema frecuente y pedir soporte básico |
| B1 | Colaboración de equipo | Participar en una daily/stand-up sencilla, explicar qué hizo y qué hará, redactar un bug report comprensible y resumir un cambio |
| B2 | Comunicación técnica autónoma | Explicar una API o flujo conocido, comparar alternativas, participar en code review, escribir documentación y responder preguntas de entrevista sobre experiencia propia |
| C1 | Diseño, liderazgo e incidentes | Defender decisiones de arquitectura, explicar trade-offs y riesgos, presentar un postmortem, negociar alcance y facilitar discusiones técnicas |
| C2 — extensión | Especialización y comunicación experta | Sintetizar investigaciones, evaluar propuestas complejas, mentorizar, persuadir con matices y adaptar registro a audiencias multidisciplinares |

**Regla de alineación:** un estudiante puede tener, por ejemplo, Inglés General B1 y Tecnología A2. No se elevará su nivel general por reconocer terminología técnica. La plataforma mostrará perfiles separados y explicará qué evidencia sostiene cada uno.

### 2.3. Dominios transversales

Los dos cursos deben distribuir actividades en los cuatro dominios de uso del idioma:

- **Personal:** identidad, relaciones, rutinas, experiencias e intereses.
- **Público:** servicios, comunidad, viajes, información, cultura y ciudadanía.
- **Educativo:** aprendizaje, instrucciones, explicación, investigación y presentación.
- **Profesional:** tareas, colaboración, herramientas, reuniones, documentación, proyectos e incidentes.

No se reservará toda la comunicación profesional para B2: desde A1 se usarán contextos de estudio y trabajo con una complejidad lingüística adecuada al nivel.

## 3. Estructura de cursos, unidades y lecciones

### 3.1. Tamaño de referencia para la primera edición

La siguiente volumetría es una **base editorial de planificación**, no una regla del MCER ni una promesa de duración total:

| Curso general | Unidades | Lecciones por unidad | Total de lecciones |
|---|---:|---:|---:|
| Pre-A1 / A0 | 4 | 4 | 16 |
| A1 | 6 | 4 | 24 |
| A2 | 6 | 4 | 24 |
| B1 | 6 | 4 | 24 |
| B2 | 6 | 4 | 24 |
| C1 | 6 | 4 | 24 |
| C2 — extensión opcional | 4 | 4 | 16 |

La ruta tecnológica tendrá módulos alineados por banda: A2, B1, B2 y C1 tendrán inicialmente cuatro unidades por nivel, con cuatro lecciones por unidad. A1 introduce el vocabulario digital dentro de Inglés General; C2 tecnológico se planifica como extensión cuando exista demanda y evidencia editorial suficiente.

La volumetría se revisará después del piloto de contenido y uso. No se reducirá la cobertura de una competencia para cumplir una cantidad fija de pantallas.

### 3.2. Patrón de unidad de cuatro lecciones

Cada unidad tendrá un tema comunicativo, de dos a cuatro objetivos principales, un conjunto léxico delimitado, estructuras gramaticales focales y una tarea final.

| Lección | Función didáctica | Evidencias habituales |
|---|---|---|
| 1. Descubrir y comprender | Activar contexto; presentar vocabulario, expresiones y modelo oral/escrito | Reconocimiento léxico, escucha guiada, lectura breve y observación de formas |
| 2. Entender cómo funciona | Guiar comprensión y atención a gramática, pronunciación, cohesión o registro | Comprensión auditiva/lectora y práctica controlada con retroalimentación |
| 3. Practicar para comunicar | Pasar de práctica guiada a producción e interacción | Frases, párrafo, mensaje, diálogo o intervención oral según el nivel |
| 4. Integrar y demostrar | Resolver una tarea con sentido, recuperar lo aprendido y comprobar objetivos | Tarea integradora, evidencia por competencia, autoevaluación y revisión espaciada posterior |

Una lección tendrá normalmente **4–6 actividades** y una duración orientativa de **15–25 minutos**. El tiempo no será criterio de dominio. La combinación de actividades debe cubrir el objetivo de la lección y no añadir ejercicios de relleno.

### 3.3. Cobertura mínima por unidad

Cada unidad de Inglés General debe incluir, como mínimo:

- Dos actividades de listening con audio como estímulo primario.
- Dos actividades de reading con textos adecuados al nivel.
- Una producción escrita con propósito y destinatario definidos.
- Una producción hablada sustentada por audio del estudiante cuando se evalúe desempeño oral.
- Una interacción oral o escrita con turnos, respuesta o negociación de significado.
- Una tarea de mediación o transferencia de información, graduada desde instrucciones simples hasta síntesis y explicación.
- Una tarea integradora y una comprobación de recuperación de vocabulario/estructuras.

La misma actividad puede contribuir a más de una competencia solo si cada evidencia se identifica por separado. Una respuesta escrita a una pregunta sobre un audio no debe convertirse en una puntuación de speaking.

## 4. Mapa temático de Inglés General

Los siguientes son los temas de las unidades iniciales; cada curso debe convertirlos en objetivos y actividades, no en listas de traducciones.

| Nivel | Unidades y situaciones de referencia |
|---|---|
| Pre-A1 / A0 | 1. Saludar y dar datos personales; 2. Números, tiempo y objetos básicos; 3. Personas, familia y espacios cercanos; 4. Necesidades, instrucciones y lugares familiares |
| A1 | 1. Presentaciones e identidad; 2. Rutinas y horarios; 3. Personas, hogar y ciudad; 4. Comida, compras y preferencias; 5. Transporte y citas; 6. Estudio, trabajo inicial y vida digital |
| A2 | 1. Experiencias recientes y pasadas; 2. Viajes, alojamiento y servicios; 3. Hábitos, bienestar y situaciones cotidianas; 4. Tareas, responsabilidades y planes; 5. Relaciones, invitaciones y eventos; 6. Tecnología cotidiana, medios e instrucciones |
| B1 | 1. Experiencias y relatos; 2. Trabajo, estudio y colaboración; 3. Viajes, cultura y medios; 4. Opiniones y asuntos sociales; 5. Problemas, decisiones y soluciones; 6. Metas, cambios y proyectos futuros |
| B2 | 1. Carrera y desarrollo profesional; 2. Noticias, cultura y perspectivas; 3. Ciencia, tecnología e innovación; 4. Problemas sociales y globales; 5. Negociación, acuerdos y desacuerdos; 6. Argumentación, presentaciones y propuestas |
| C1 | 1. Ideas abstractas y debates; 2. Liderazgo, influencia y comunicación; 3. Cultura, literatura y discurso; 4. Innovación, ética y consecuencias; 5. Temas especializados y análisis crítico; 6. Persuasión, síntesis y presentación ejecutiva |
| C2 — extensión | 1. Matiz, ironía y referencias culturales; 2. Retórica y estilo; 3. Síntesis de fuentes complejas; 4. Comunicación experta, creativa e intercultural |

## 5. Mapa temático de English for Technology & Professional Communication

La ruta tecnológica reutiliza objetivos generales cuando corresponda, pero las tareas, los textos y la terminología se seleccionan por función profesional.

| Nivel | Módulos propuestos |
|---|---|
| A1 — contexto integrado | Dispositivos, aplicaciones, acciones digitales, perfil de estudiante/desarrollador y solicitud de ayuda memorizada |
| A2 | 1. Hardware, software y herramientas; 2. Instrucciones y tareas simples; 3. Problemas frecuentes y soporte; 4. Rutinas de estudio/trabajo y descripción de responsabilidades |
| B1 | 1. Daily meetings y actualización de tareas; 2. Tickets, bugs y reproducción de problemas; 3. Explicar cambios y soluciones; 4. Colaboración, feedback y comunicación asíncrona |
| B2 | 1. Documentación y comunicación de APIs; 2. Code review y colaboración técnica; 3. Fundamentos de arquitectura, datos y cloud; 4. Entrevistas, proyectos y comunicación de trade-offs |
| C1 | 1. Diseño de sistemas y decisiones de arquitectura; 2. Incidentes, observabilidad y postmortems; 3. Liderazgo técnico, negociación y gestión de riesgos; 4. Presentaciones, propuestas y comunicación entre especialidades |
| C2 — extensión | 1. Debate de decisiones técnicas ambiguas; 2. Comunicación estratégica y mentoría; 3. Síntesis crítica de investigación; 4. Comunicación experta para audiencias ejecutivas y técnicas |

Las unidades se situarán en escenarios auténticos: daily, issue tracker, pull request, documentación, demo, reunión de diseño, incidente, entrevista o presentación. El vocabulario técnico no debe introducirse antes de que el estudiante pueda comprender la estructura lingüística necesaria para usarlo.

## 6. Resultados observables por competencia y nivel

Los resultados siguientes son paráfrasis curriculares propias inspiradas en descriptores de referencia. Cada resultado se desglosará luego en objetivos de unidad y criterios de actividad.

| Nivel | Listening | Reading | Writing | Speaking e interacción |
|---|---|---|---|---|
| Pre-A1 / A0 | Reconocer palabras y expresiones muy frecuentes en instrucciones breves, con contexto y apoyo visual | Identificar nombres, etiquetas, señales y mensajes muy cortos familiares | Copiar y completar datos; producir palabras y fórmulas muy breves | Saludar, decir datos personales y responder preguntas previsibles con modelos y apoyo |
| A1 | Comprender expresiones frecuentes y el tema/datos concretos de mensajes breves y claros | Entender frases y textos simples sobre personas, lugares, rutinas y necesidades | Escribir frases y mensajes breves siguiendo modelos | Intercambiar información sencilla; preguntar, responder y describir aspectos inmediatos |
| A2 | Captar información principal y detalles previsibles de mensajes claros sobre asuntos cotidianos | Localizar información concreta en textos breves y comprender descripciones sencillas | Escribir notas, mensajes y párrafos cortos conectados con conectores básicos | Resolver intercambios rutinarios, describir experiencias y expresar planes, gustos y necesidades |
| B1 | Comprender puntos principales de habla clara sobre temas familiares, laborales y de estudio | Comprender textos directos de interés personal/profesional y reconocer argumentos principales | Redactar textos conectados para narrar, explicar, solicitar y justificar | Mantener conversaciones sobre temas conocidos, relatar experiencias y explicar razones |
| B2 | Seguir discursos y debates relativamente complejos, incluidos temas técnicos del propio campo | Comprender artículos, documentación y textos argumentativos sobre temas actuales o especializados | Redactar informes, propuestas y argumentos claros con estructura y detalle | Interactuar con fluidez suficiente para colaborar, negociar, comparar opciones y defender una postura |
| C1 | Seguir discursos extensos y exigentes, incluso con estructura implícita, y reconocer actitud y matices | Comprender textos extensos, especializados y literarios, incluidos significados implícitos | Producir textos bien organizados, precisos y adaptados a propósito, audiencia y registro | Expresarse espontáneamente y con flexibilidad; presentar, matizar, persuadir y responder a objeciones |
| C2 — extensión | Comprender prácticamente cualquier variedad de audio con mínima dificultad, según exposición y contexto | Interpretar textos complejos, estilos, alusiones y matices finos | Sintetizar fuentes y producir textos de alta precisión estilística y pragmática | Comunicar matices sutiles, reformular con precisión y sostener interacción compleja con control del registro |

### 6.1. Competencias transversales

- **Interacción:** tomar turnos, pedir aclaración, confirmar comprensión, reparar malentendidos y adaptar la respuesta al interlocutor.
- **Mediación:** seleccionar, explicar, resumir o reformular información para que otra persona pueda comprenderla o actuar.
- **Interacción en línea:** escribir mensajes, colaborar en herramientas digitales, responder a aportes y combinar texto, audio u otros medios de forma apropiada.
- **Competencia fonológica:** inteligibilidad, percepción de contrastes relevantes, acento léxico, ritmo y entonación. El objetivo es comunicación comprensible, no borrar el acento del estudiante.

## 7. Vocabulario receptivo y productivo

### 7.1. Unidad léxica y medición

El catálogo contará **unidades léxicas enseñables**, no cadenas de texto sin contexto. Una unidad puede ser una palabra lema, una expresión fija, una colocación o un phrasal verb cuando su significado/uso requiera enseñanza propia. Las flexiones regulares no se contarán como unidades nuevas. Una colocación no debe duplicarse artificialmente con cada palabra que la compone.

Cada elemento léxico tendrá, como mínimo:

- Forma canónica y variantes ortográficas/gramaticales pertinentes.
- Significado contextual en inglés claro y apoyo en español cuando sea pedagógicamente útil.
- Nivel objetivo y nivel de introducción recomendado.
- Etiquetas de dominio, tema, frecuencia/prioridad y registro.
- Ejemplo natural y contexto de uso.
- Clasificación inicial: receptivo, productivo o ambos.
- Colocaciones, restricciones y errores previsibles cuando aporten valor.
- Pronunciación/audio y guía dual lenta/natural cuando corresponda y haya validación editorial.

La clasificación de contenido receptivo/productivo es una meta curricular. El estado real de dominio se calcula por estudiante y se mantiene separado: reconocer un ítem no implica poder utilizarlo espontáneamente.

### 7.2. Presupuesto léxico provisional

El MCER no prescribe un número oficial de palabras para cada nivel. Para planificar curación y evitar catálogos arbitrarios, se adopta esta **meta interna acumulativa v1.0**. Los rangos deberán validarse con perfiles de frecuencia, cobertura de textos/audio y revisión pedagógica antes de publicar cada curso.

| Nivel | Unidades léxicas receptivas acumuladas | Unidades léxicas productivas acumuladas | Foco de expansión |
|---|---:|---:|---|
| Pre-A1 / A0 | 300–450 | 150–250 | Palabras concretas, fórmulas, necesidades y chunks muy frecuentes |
| A1 | 700–1.000 | 400–600 | Rutinas, personas, lugares, objetos, necesidades y expresiones funcionales |
| A2 | 1.300–1.800 | 800–1.100 | Situaciones cotidianas, experiencias, planes, servicios y trabajo simple |
| B1 | 2.200–2.800 | 1.400–1.800 | Temas familiares amplios, narración, opinión, colaboración y solución de problemas |
| B2 | 3.500–4.500 | 2.200–2.800 | Argumentación, matices frecuentes, collocations y terminología del propio campo |
| C1 | 5.200–7.000 | 3.200–4.200 | Vocabulario abstracto, especializado, idiomático y variación de registro |
| C2 — extensión | 7.500–10.000 | 4.500–6.000 | Repertorio amplio, connotación, colocaciones finas, idiomaticidad y léxico poco frecuente |

Estos rangos no equivalen a un puntaje CEFR, no son requisitos universales y no sustituyen la evidencia de comprensión/uso. Se ajustarán si el análisis de corpus demuestra que el repertorio previsto no proporciona cobertura suficiente o introduce elementos poco útiles.

### 7.3. Distribución editorial por nivel

- Pre-A1/A0–A1: priorizar palabras de alta frecuencia y fórmulas completas; no exigir producción aislada de vocabulario raro.
- A2–B1: ampliar campos semánticos, verbos frecuentes, expresiones funcionales, colocaciones iniciales y vocabulario de trabajo/estudio.
- B2: enseñar colocaciones, familias léxicas, phrasal verbs frecuentes y términos técnicos relevantes para el área propia, con distinción de registro.
- C1–C2: profundizar en precisión, sinonimia, connotación, idiomaticidad, discurso académico/profesional y vocabulario especializado. No confundir rareza con calidad.

## 8. Progresión gramatical y prerequisitos

La gramática se enseña al servicio de una intención comunicativa. Las secuencias son una decisión curricular de DevFluency, no una lista oficial del MCER. Las estructuras se introducen, practican, recuperan y amplían en espiral.

| Nivel | Estructuras focales | Prerequisito para progresar |
|---|---|---|
| Pre-A1 / A0 | Orden básico sujeto-verbo-complemento; pronombres personales; verbo *be* en fórmulas; artículos y plurales frecuentes; demostrativos; posesivos básicos; imperativos; preguntas memorizadas con *what/where/how* | Construir y comprender enunciados muy breves sobre identidad, objetos y necesidades con apoyo |
| A1 | Presente simple; preguntas/negación con *do*; presente continuo en situaciones visibles; *have got*; *there is/are*; *can/can't*; sustantivos contables/no contables; *some/any* inicial; preposiciones frecuentes; adverbios de frecuencia; pasado simple introductorio de alta frecuencia | Resolver intercambios breves en presente y describir personas, rutinas, lugares y acciones actuales |
| A2 | Pasado simple regular/irregular; planes con *going to* y presente continuo; comparativos/superlativos; cuantificadores; modales *must/have to/should/could*; conectores básicos; present perfect introductorio para experiencias frecuentes; gerundio/infinitivo en patrones comunes | Relatar experiencias y organizar planes, preferencias, instrucciones y obligaciones sencillas |
| B1 | Contraste de tiempos presentes/pasados; pasado continuo; present perfect vs past simple; futuros; primer y segundo condicional; pasiva básica; relativas definitorias; estilo indirecto inicial; verbos modales para consejo, posibilidad y obligación; gerundio/infinitivo | Narrar, explicar causas, formular hipótesis simples y conectar ideas con coherencia |
| B2 | Pasiva en más tiempos; condicionales avanzados y mixtos de alta utilidad; modales perfectos; relativas no definitorias y reducción inicial; estilo indirecto; cláusulas participiales frecuentes; estructuras de énfasis; hedging; cohesión discursiva | Defender argumentos, comparar alternativas y expresar grado de certeza, concesión y consecuencias |
| C1 | Inversión enfática; cleft sentences; nominalización; elipsis y sustitución; subordinación compleja; modalidad y evidencialidad; estructuras de énfasis; patrones de registro formal; cohesión avanzada | Seleccionar estructuras según intención, audiencia y registro; producir discurso preciso y bien organizado |
| C2 — extensión | Control estilístico y retórico de recursos gramaticales; variación sintáctica; elipsis, ironía y énfasis; precisión pragmática; edición de textos complejos | Elegir conscientemente alternativas sintácticas y pragmáticas sin pérdida de claridad o naturalidad |

**Prerequisitos de contenido:**

- Una estructura nueva no será requisito de una actividad antes de haber sido presentada o explicada.
- Los ejercicios de producción libre solo exigirán estructuras que el curso haya trabajado o que el estudiante ya domine según evidencia.
- Las estructuras pueden aparecer receptivamente antes de exigirse de manera productiva.
- Un objetivo gramatical no se considera logrado por reconocer una regla: debe usarse apropiadamente en una tarea contextualizada.

## 9. Dificultad y diseño de actividades

La dificultad no se determina solo por longitud o nivel de vocabulario. Cada recurso y actividad se clasifica al menos en estas dimensiones:

1. **Carga léxica:** frecuencia, cantidad de unidades nuevas, expresiones idiomáticas y especialización.
2. **Carga gramatical:** cantidad de estructuras nuevas y densidad sintáctica.
3. **Comprensión auditiva:** velocidad, claridad, familiaridad del acento, número de hablantes, ruido, segmentación y necesidad de inferencia.
4. **Comprensión lectora:** extensión, estructura, densidad informativa, cohesión, abstracción y significado implícito.
5. **Producción:** longitud, autonomía, precisión esperada, organización y complejidad de la tarea.
6. **Interacción:** espontaneidad, turnos, reparación, negociación, distancia social y registro.
7. **Contexto:** familiaridad del tema, dominio público/personal/educativo/profesional y carga cultural.

### 9.1. Escalera de complejidad

- **Pre-A1/A0:** reconocimiento, elección guiada, repetición con sentido, respuesta de una palabra/fórmula y apoyo visual.
- **A1:** completar, ordenar, formular preguntas, mensajes muy breves y diálogos previsibles.
- **A2:** describir, comparar de forma simple, narrar hechos, resolver intercambios rutinarios y escribir párrafos cortos.
- **B1:** explicar procesos conocidos, justificar opiniones, resumir textos directos y resolver tareas con varios pasos.
- **B2:** integrar fuentes, comparar alternativas, negociar, argumentar y comunicar información técnica conocida.
- **C1:** sintetizar fuentes exigentes, captar implicaciones, adaptar registro y sostener tareas abiertas.
- **C2:** interpretar matices, evaluar perspectivas, reformular con precisión y controlar estilo, intención y audiencia.

### 9.2. Regla de progresión

Una unidad no debe incrementar simultáneamente todas las dimensiones de dificultad. Se introducirá una carga principal nueva mientras las demás se mantienen o se recuperan de forma controlada. Todo incremento debe tener una razón ligada al objetivo de aprendizaje.

## 10. Pronunciación, listening y modalidad oral

### 10.1. Sistema Dual de Pronunciación

Se conserva el sistema acordado para hispanohablantes:

**Texto en inglés → guía aproximada lenta → audio lento → repetición → guía aproximada natural → audio natural → repetición → significado/contexto.**

- Las guías escritas son aproximaciones pedagógicas; nunca se presentarán como IPA/AFI exacto.
- Deben evitar equivalencias falsas entre sonidos ingleses y españoles y señalar contrastes relevantes cuando proceda, por ejemplo /ɪ/–/iː/, /æ/, /θ/ y /ð/.
- Las variantes lenta y natural deben corresponder a la misma expresión y versión del contenido.
- La reducción de velocidad no debe deformar los fonemas ni hacer ininteligible el audio.
- La guía y el audio deben pasar revisión editorial/pronunciación antes de publicarse.
- Esta ayuda es pedagógica; no puntúa pronunciación.

### 10.2. Listening audio-first

- El audio es el estímulo primario. La transcripción, subtítulos, traducción o pista que revele la respuesta se ocultan hasta que el estudiante haya respondido, salvo actividad explícita de lectura auditiva.
- Se puede repetir el audio según objetivo y nivel; la cantidad de repeticiones se registra cuando afecte la interpretación del resultado.
- Las preguntas evalúan lo escuchado, no la lectura de una transcripción.
- El texto posterior puede apoyar feedback y aprendizaje, pero no modifica retroactivamente la evidencia inicial.
- Acentos, voces y velocidades se introducen gradualmente; la variedad no se usa como dificultad sorpresa.

### 10.3. Writing y speaking separados

- Writing se evalúa sobre texto: cumplimiento de tarea, claridad, organización, gramática y vocabulario apropiado.
- Speaking requiere audio original o representación acústica validada. Pronunciación, inteligibilidad, fluidez e interacción oral no se infieren solo de una transcripción.
- La transcripción puede apoyar el análisis léxico/gramatical, pero no reemplaza el audio.
- Si el audio falta o no es evaluable, las métricas orales se marcan como “no medidas”.
- Una misma tarea integrada puede generar dos evidencias distintas, una escrita y otra hablada, con rúbricas separadas.

Estas reglas implementan las decisiones ya aceptadas en ADR-0003; no redefinen ni habilitan la evaluación actual que todavía no analiza el audio original.

## 11. Evaluación, desbloqueo y dominio

### 11.1. Perfil por competencia

La plataforma mantendrá perfiles independientes al menos para:

- Listening.
- Reading.
- Writing.
- Speaking / interacción oral.
- Interacción escrita.
- Mediación, cuando exista evidencia suficiente.
- Vocabulario y gramática como objetivos transversales, no como sustitutos de las cuatro competencias.

No se calculará un nivel único promediando competencias débiles y fuertes. El nivel general mostrado deberá incluir un perfil por habilidad y una explicación de las evidencias. Un resultado de producto no constituye certificado oficial del MCER.

### 11.2. Criterios iniciales de logro

Para el piloto curricular se propone esta rúbrica interna de cuatro bandas, aplicable por objetivo y evidencia, no como escala oficial CEFR:

| Banda | Significado |
|---|---|
| 0 — Sin evidencia | No realizó la tarea o la evidencia no permite juzgar el objetivo |
| 1 — Inicial | Lo logra solo con mucha ayuda; errores impiden completar parte importante de la tarea |
| 2 — En desarrollo | Completa la tarea con apoyo o inconsistencias; el significado suele ser recuperable |
| 3 — Autónomo | Cumple el objetivo de forma independiente, comprensible y apropiada para el nivel |
| 4 — Sólido / transferible | Cumple con consistencia y transfiere el aprendizaje a un contexto nuevo del mismo nivel |

Criterios operativos propuestos para cada unidad:

- Actividades de selección/comprensión: al menos 80% en la comprobación de objetivo, con un segundo ítem o contexto que descarte acierto casual.
- Writing: banda mínima 3 en cumplimiento de tarea y claridad; banda mínima 2 en control lingüístico y organización, aplicando la rúbrica escrita correspondiente.
- Speaking: banda mínima 3 en cumplimiento e inteligibilidad; banda mínima 2 en fluidez/interacción y control lingüístico, solo cuando el audio sea suficiente y la rúbrica lo permita.
- No se compensará un objetivo no logrado con XP, tiempo de uso o puntuación de otra competencia.

Estos umbrales son hipótesis iniciales de diseño. Se calibrarán con muestras reales revisadas por docentes antes de usarse para decisiones de alto impacto.

### 11.3. Desbloqueo y recuperación

1. La inscripción empieza con diagnóstico/ubicación por competencia; el estudiante no está obligado a empezar en Pre-A1 si demuestra dominio previo.
2. Dentro del curso, las unidades declaran prerequisitos explícitos sobre objetivos previos, no solo sobre haber pulsado “completar”.
3. La siguiente unidad se desbloquea cuando se han aportado evidencias de los objetivos esenciales de la unidad actual según los criterios anteriores.
4. Si solo falla una competencia, se asigna práctica de recuperación específica. No se repite todo el curso sin motivo.
5. El diagnóstico puede reconocer objetivos ya dominados y permitir avanzar, pero el salto de nivel exige evidencia para cada competencia núcleo y no solo un promedio global.
6. El estudiante puede acceder a repasos y recursos de refuerzo sin alterar el estado de publicación del contenido.
7. XP, monedas, rachas y logros motivan; nunca desbloquean un nivel académico por sí solos.

### 11.4. SRS y repetición espaciada

- SRS refuerza recuperación de vocabulario y estructuras; no sustituye producción, interacción ni evaluación de comprensión.
- Un ítem puede pasar de reconocimiento a práctica productiva solo después de evidencia de uso.
- Reaparecerá en contextos distintos y con dificultad creciente, no únicamente mediante tarjetas idénticas.
- Como regla editorial inicial, un objetivo léxico debe aparecer en al menos cuatro encuentros significativos repartidos en tres contextos o tipos de actividad, incluyendo una recuperación diferida, antes de considerarse suficientemente practicado. El dominio individual sigue dependiendo de los intentos del estudiante.

## 12. Control de repetición y consistencia vertical

Para cada objetivo y unidad se mantendrá una matriz de trazabilidad con: nivel, competencia, descriptor de referencia, objetivo observable, contenido, estructura lingüística, actividad, prerequisito, evidencia y criterio de logro.

Reglas contra saltos y duplicados:

- Ningún objetivo aparece por primera vez en una evaluación de salida.
- Los objetivos nuevos tienen una introducción, práctica guiada, aplicación comunicativa y recuperación posterior.
- La repetición entre niveles debe ser espiral: recuperar, ampliar, aumentar autonomía, cambiar contexto o añadir matiz. Copiar la misma actividad con un título distinto no cuenta como progresión.
- Cada ítem de vocabulario tiene un nivel principal de introducción; niveles posteriores pueden reusarlo con otro significado, colocación, registro o uso productivo.
- Gramática y léxico se distribuyen por prerequisitos y frecuencia de uso, no solo por capítulos tradicionales.
- Antes de publicar, se ejecutan controles de duplicidad semántica, cobertura de objetivos, referencias rotas y dificultad fuera de rango.
- Las variantes dialectales y culturales se documentan; no se penaliza una variante válida que no sea el acento elegido para el audio modelo.

## 13. Fuentes y límites de interpretación

1. [Council of Europe — CEFR Companion Volume (2020) y versiones oficiales](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions). Referencia primaria para Pre-A1, descriptores ampliados, competencia fonológica, mediación e interacción en línea.
2. [Council of Europe — CEFR Descriptors](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors). Los niveles se expresan mediante descriptores ilustrativos de lo que el usuario puede hacer.
3. [Council of Europe — The CEFR Levels](https://www.coe.int/en/web/common-european-framework-reference-languages/level-descriptions). Escala global y orientación de niveles.
4. [Council of Europe — Online interaction](https://www.coe.int/en/web/common-european-framework-reference-languages/online-interaction). Orientación para comunicación síncrona/asíncrona y multimodal.
5. [Council of Europe — Mediation](https://www.coe.int/en/web/common-european-framework-reference-languages/mediation). Orientación para facilitar comprensión, reformular y transmitir significado entre personas/contextos.

**Límites:** el MCER no proporciona una lista universal obligatoria de gramática, un número oficial de palabras por nivel, una cantidad fija de lecciones ni una fórmula de desbloqueo. Los rangos léxicos, la volumetría, las rúbricas y los umbrales de este documento son decisiones internas propuestas para el piloto de DevFluency; deben calibrarse y documentarse con evidencia pedagógica antes de usarse como afirmaciones de equivalencia o certificación.

## 14. Criterios de aceptación de Fase 1.1

La definición curricular se considera lista para revisión cuando:

- Existe una ruta general Pre-A1/A0–C1 y una extensión C2, con resultados globales diferenciados.
- Existe una ruta tecnológica alineada por nivel sin sustituir la ruta general.
- Cada nivel tiene temas, objetivos comunicativos y criterios de progresión.
- Se definieron resultados observables de listening, reading, writing y speaking/interacción por nivel.
- Se definieron presupuestos léxicos receptivos/productivos como metas internas sujetas a validación.
- Se definió progresión gramatical y prerequisitos.
- Se definió tamaño de curso/unidad/lección y complejidad de actividades.
- Se definieron desbloqueo, recuperación, SRS y evaluación por evidencia.
- Listening, writing y speaking respetan las decisiones de ADR-0003 y el Sistema Dual de Pronunciación.
- La matriz de trazabilidad permite comprobar que no hay objetivos huérfanos, saltos de dificultad ni repetición vacía.

**Fuera de alcance de 1.1:** crear tablas/migraciones, contratos API, importadores, contenido completo de las unidades, grabaciones, prompts de evaluación y publicación del catálogo. Eso corresponde a 1.2–1.5 y a sus pruebas.

## 15. Decisiones abiertas para el piloto

Estas decisiones no bloquean el blueprint, pero deben resolverse con el piloto de Fase 1.3/1.4:

- Ajustar los rangos léxicos con perfiles de frecuencia y cobertura de textos/audio por nivel.
- Calibrar las rúbricas y los umbrales con docentes/revisores y muestras de estudiantes.
- Confirmar la duración promedio real de lecciones a partir de uso, no solo estimaciones editoriales.
- Seleccionar acentos de referencia iniciales para los audios y un protocolo de revisión de pronunciación.
- Decidir qué unidades tecnológicas se publican primero según el perfil de estudiante y disponibilidad de contenido validado.
