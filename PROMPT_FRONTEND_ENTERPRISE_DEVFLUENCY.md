# 🎨 MASTER PROMPT: DESARROLLO DEL FRONTEND ENTERPRISE DEVFLUENCY AI
**Next.js 15 + TypeScript + Tailwind CSS v4 + DDD + Clean Architecture + Multi-Tenant Auth + Glassmorphism UX**

> 📋 **Instrucciones para el Modelo de IA**: Copia y pega todo el contenido de este documento en tu asistente de código (Cursor, Claude 3.5 Sonnet, GPT-4o) para generar el Frontend Enterprise de DevFluency AI al 100%.

---

## 🎯 OBJETIVO DEL SISTEMA
Construir una plataforma web de inglés conversacional de clase mundial inspirada en la estética visual de **Linear, Raycast y Cursor**, diseñada específicamente para **desarrolladores de software hispanohablantes** que aspiran a conseguir empleo en empresas internacionales de EE. UU., Europa y trabajo remoto.

---

## 🏛️ PATRÓN DE ARQUITECTURA: DDD + CLEAN ARCHITECTURE

```text
src/
├── domain/                      # Capa de Dominio (Entidades, Value Objects, Repositorios)
│   ├── entities/
│   │   ├── User.ts              # Id, Email, FullName, TargetRole, CurrentLevel
│   │   ├── VocabularyWord.ts    # Palabra, Fonética sin IPA, Oraciones en contexto
│   │   └── ExamResult.ts        # Matriz de 6 Métricas, Target >= 90%, 20-min Weakness Drill
│   └── repositories/
│       ├── IAuthRepository.ts
│       ├── IContentRepository.ts
│       └── IAIEvaluatorRepository.ts
├── application/                 # Capa de Aplicación (Casos de Uso)
│   ├── use-cases/
│   │   ├── RegisterUserUseCase.ts
│   │   ├── LoginUserUseCase.ts
│   │   ├── GetVocabularyListUseCase.ts
│   │   └── EvaluateExamAnswerUseCase.ts
├── infrastructure/              # Capa de Infraestructura (Adaptadores HTTP a BFF Rust en :8080)
│   └── api/
│       ├── BffHttpClient.ts
│       ├── BffAuthRepository.ts
│       ├── BffContentRepository.ts
│       └── BffAIEvaluatorRepository.ts
└── presentation/                # Capa de Presentación (React 19, UI Components, Pages, Hooks)
    ├── components/
    │   ├── ui/
    │   │   ├── Header.tsx
    │   │   ├── Sidebar.tsx
    │   │   ├── FlashcardPlayer.tsx
    │   │   ├── AudioVisualizer.tsx
    │   │   ├── MetricBar.tsx
    │   │   └── WeaknessDrillModal.tsx
    │   └── auth/
    │       ├── AuthGuard.tsx
    │       ├── LoginForm.tsx
    │       └── RegisterForm.tsx
    └── app/
        ├── (auth)/
        │   ├── login/page.tsx
        │   └── register/page.tsx
        ├── (dashboard)/
        │   ├── dashboard/page.tsx
        │   ├── learn/page.tsx
        │   ├── interview-simulator/page.tsx
        │   ├── srs-review/page.tsx
        │   └── profile/page.tsx
        └── layout.tsx
```

---

## 🎨 REGLAS DE DISEÑO & ESTÉTICA ULTRA-PREMIUM (LINEAR / RAYCAST DARK THEME)

1. **Paleta de Colores Curada (Dark Mode)**:
   * Background Principal: `#0B0D13` (Ultra oscuro profundo)
   * Tarjetas & Paneles: `#141722` con `backdrop-filter: blur(16px)` y bordes `rgba(255, 255, 255, 0.08)` (Glassmorphism).
   * Acentuación primaria: Gradiente Cian `#00F2FE` $\rightarrow$ Azul `#4FACFE`.
   * Acentuación secundaria: Púrpura Neón `#8B5CF6` $\rightarrow$ Índigo `#6366F1`.
   * Puntuaciones y Alertas: Verde Esmeralda `#10B981` (Aprobado $\ge 90\%$), Ámbar Gold `#F59E0B` (Rachas/Monedas), Rosa Carmesí `#F43F5E` (Atención).

2. **Tipografía & Micro-Animaciones**:
   * Fuente principal: Inter / System UI.
   * Micro-animaciones al hacer hover en tarjetas, botones glowing con sombras de luz suave (`box-shadow: 0 0 25px rgba(0, 242, 254, 0.3)`).

---

## 📄 DESGLOSE COMPLETO DE MÓDULOS Y PÁGINAS A IMPLEMENTAR

### 1. 🔐 Módulo de Autenticación & Aislamiento Multi-Tenant (`/login` y `/register`)
* **`/register`**:
  * Formulario estilizado con campos: Nombre completo, Email profesional, Contraseña segura, **Rol Target** (Backend, DevOps, Fullstack, Mobile, Data), **Nivel Inicial** (A0 a C1).
  * Llama al use case `RegisterUserUseCase` que conecta al BFF (`POST /api/v1/auth/register`).
  * Guarda la sesión JWT de forma aislada para garantizar que ningún cliente vea datos de otros.
* **`/login`**:
  * Autenticación con email y contraseña, validación en tiempo real con Zod/React Hook Form.
  * Llama a `LoginUserUseCase` (`POST /api/v1/auth/login`).

### 2. 📊 Módulo Panel de Control Multi-Tenant (`/dashboard`)
* Saludo personalizado ("Welcome back, Kevin!").
* Tarjetas de Gamificación:
  * 🔥 **Racha Diaria**: Contador de días consecutivos practicando.
  * 💎 **Monedas Tech**: Recompensas acumuladas por lecciones completadas.
  * 🏆 **Nivel Actual**: Indicador visual A0, A1, A2, B1, B2 o C1.
* Gráfico de radar o barras con la evolución de las **6 Métricas** del estudiante.
* Accesos directos a la lección del día y al simulador de entrevistas.

### 3. 🔊 Módulo Lecciones & Tarjetas Conversacionales (`/learn`)
* **Regla de Oro Pedagógica**: Formato obligatorio en cada tarjeta:
  ```text
  🇺🇸 Inglés
  We refactored the monolith into microservices.

  🔊 Pronunciación para Hispanohablantes (Fonética Natural en Español)
  Güi rifáktord da mónolith íntu máikroservises.

  🇪🇸 Traducción
  Reestructuramos el monolito en microservicios.
  ```
* Carrusel para alternar entre las **3 a 5 frases en contexto** por palabra.
* Botón de reproducción de audio nativo de EE. UU. (**AWS Polly Neural Voice**).

### 4. 🤖 Módulo Simulador de Entrevistas Reclutador IA (`/interview-simulator`)
* El Reclutador IA (AWS Bedrock Claude 3.5 Sonnet) realiza preguntas impredecibles de entrevista técnica (ej. *"Tell me about a time you had an incident in production"*).
* Caja de entrada de respuesta en texto o grabación de voz por micrófono (AWS Transcribe).
* **Desglose Analítico de las 6 Métricas**:
  1. Listening (20%)
  2. Pronunciación (20%)
  3. Fluidez (20%)
  4. Vocabulario (15%)
  5. Conversación (15%)
  6. Gramática (10%)
* **Verificación de Aprobación**: Muestra distintivo **APROBADO (Target $\ge 90.0\%$)** o **DESAPROBADO**.
* **Generador de Dril Quirúrgico de 20 Minutos**: Si el puntaje es $< 90\%$, aísla automáticamente las 2 áreas más débiles y despliega el modal de entrenamiento específico.

### 5. 🧠 Módulo Repetición Espaciada Anki SM-2 (`/srs-review`)
* Sistema de memorización espaciada con botones de calificación:
  * 🔴 **Again (0)** - Reinicia a 1 día.
  * 🟠 **Hard (3)** - Factor de facilidad ajustado.
  * 🟢 **Good (4)** - Progreso constante.
  * 🔵 **Easy (5)** - Máximo intervalo.

---

## 🛠️ CONEXIÓN CON EL BACKEND (BFF RUST EN PUERTO 8080)

Variables de entorno `.env.local`:
```ini
NEXT_PUBLIC_BFF_URL=http://localhost:8080
```

Headers HTTP con aislamiento Multi-Tenant:
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${accessToken}`
}
```

---

## 🚀 INSTRUCCIONES DE EJECUCIÓN PARA LA IA
Por favor, genera la aplicación completa en TypeScript dentro del directorio `frontend/`, creando todos los archivos de dominio, use cases, repositorios, componentes de UI y páginas siguiendo esta especificación al 100%.
