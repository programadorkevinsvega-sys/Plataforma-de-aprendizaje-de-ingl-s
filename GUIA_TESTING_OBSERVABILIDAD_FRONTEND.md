# 🎨 GUÍA DE TESTING Y OBSERVABILIDAD FRONTEND: DevFluency AI (Next.js / React)

---

## 📌 PARTE 1 — ESTRATEGIA DE TESTING FRONTEND

### 1.1 Pruebas de Componentes UI (Vitest + React Testing Library)
* **Qué es**: Pruebas de renderizado y comportamiento de componentes en aislamiento.
* **Aplicación en DevFluency AI**:
  * **Tarjetas Fonéticas**: Verificar que el texto en inglés, la fonética en español natural y la traducción se renderizan en el formato correcto.
  * **Radar de 6 Métricas**: Probar que las barras de progreso y porcentajes cambian según los props recibidos.
  * **Barra de Racha y XP**: Probar actualizaciones visuales al ganar experiencia.

### 1.2 Pruebas de Audio & Web Speech API Mocking
* **Qué es**: Verificación de reproductores de voz y simuladores de micrófono.
* **Aplicación en DevFluency AI**:
  * Probar que el reproductor ejecuta el fallback a stream HTML5 Audio si `window.speechSynthesis` falla o expira tras 800ms.
  * Verificar estados visuales durante la grabación de voz (Grabando, Procesando, Resultado).

### 1.3 Pruebas de Integración y Flujos E2E (Playwright)
* **Qué es**: Pruebas automatizadas en navegador real simulando las acciones del usuario.
* **Flujos Críticos Probados**:
  1. Login de usuario $\rightarrow$ Selección de Módulo $\rightarrow$ Lección Fonética completa.
  2. Simulación de Examen IA de 6 Métricas $\rightarrow$ Generación de Reporte $\rightarrow$ Activación de Rutina de Refuerzo de 20 minutos.
  3. Flujo Anki SRS: Revelar tarjeta $\rightarrow$ Evaluar dificultad (Again/Hard/Good/Easy).

---

## 🔭 PARTE 2 — OBSERVABILIDAD Y RENDIMIENTO FRONTEND

### 2.1 Core Web Vitals y Latencia UI
* **LCP (Largest Contentful Paint)**: $< 1.2$ segundos (Carga instantánea del Dashboard estilo Linear).
* **INP (Interaction to Next Paint)**: $< 50$ milisegundos (Feedback auditivo y visual inmediato al hacer clic en botones).
* **CLS (Cumulative Layout Shift)**: $0.0$ (Cero saltos visuales al cargar tarjetas de vocabulario).

### 2.2 Monitoreo de Errores y Real User Monitoring (RUM)
* **Sentry / OpenTelemetry Web**: Captura de errores JavaScript no manejados en el cliente.
* **Trazabilidad Frontend-Backend**: Transmisión del `trace_id` desde las peticiones `fetch`/`axios` del navegador hacia la capa BFF en Rust.
