# 🔒 GUÍA DE SEGURIDAD FRONTEND: DevFluency AI (React / Next.js)

---

## 1. SANITIZACIÓN Y PREVENCIÓN DE XSS
* **Validación Estricta de Inputs**: Todo formulario utiliza esquemas estricto con `Zod`.
* **Prohibición de `dangerouslySetInnerHTML`**: Toda la fonética en español natural y oraciones en contexto se renderizan mediante componentes React seguros.
* **Content Security Policy (CSP)**: Cabeceras HTTP estrictas para restringir la ejecución de scripts externos.

---

## 2. MANEJO SEGURO DE ALMACENAMIENTO Y SESIÓN
* **Prohibición de almacenamiento de tokens en `localStorage`**: Los Refresh Tokens se gestionan mediante **Cookies HTTP-Only, Secure, SameSite=Strict**.
* **Access Tokens en Memoria**: Los Access Tokens se mantienen únicamente en el estado en memoria de la aplicación React.

---

## 3. SEGURIDAD EN CAPTURA DE AUDIO Y MICRÓFONO
* **Aislamiento de Streams de Audio**: Los permisos del micrófono Web Audio API solo se solicitan durante el entrenamiento interactivo y la pista se destruye tan pronto finaliza la grabación (`stream.getTracks().forEach(track => track.stop())`).
* **Protección contra Inyección de Audio**: Los chunks de audio capturados en voz se comprimen y validan antes de enviarse al BFF.
