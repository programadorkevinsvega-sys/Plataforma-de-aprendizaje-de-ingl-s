# 🛡️ GUÍA DE SEGURIDAD BACKEND Y gRPC: DevFluency AI (Rust Microservices)

---

## 1. PRINCIPIOS DE SEGURIDAD BACKEND
1. **Defensa en Profundidad**: Múltiples capas independientes de verificación (BFF Validator $\rightarrow$ gRPC Interceptors $\rightarrow$ Domain Value Objects $\rightarrow$ PostgreSQL RLS).
2. **Cero Confianza (Zero Trust)**: Los microservicios gRPC internos no confían ciegamente entre sí; todos validan la firma de la identidad y desinfectan cada payload Protobuf.
3. **Mínimo Privilegio**: Cada microservicio se conecta a PostgreSQL con su propio rol DB acotado únicamente a las tablas que opera.

---

## 2. AUTENTICACIÓN Y AUTORIZACIÓN ASIMÉTRICA
* **Algoritmo**: JWT firmado con par de llaves asimétricas **Ed25519 (EdDSA)**.
* **Firmado**: Realizado exclusivamente por el `auth-identity-service`.
* **Verificación**: El BFF y los microservicios gRPC validan la firma utilizando la llave pública Ed25519 sin consultar la base de datos en cada llamada.
* **Duración**: Access Tokens con expiración corta (15 minutos) y Refresh Tokens rotativos almacenados en Redis.

---

## 3. SEGURIDAD EN CAPA DE COMUNICACIÓN gRPC
* **mTLS (Mutual TLS)**: Toda la comunicación gRPC entre el BFF y los microservicios internos requiere certificados X.509 mutuos.
* **gRPC Request Interceptors (Rust / `tonic`)**:
  * Sanitización de cadenas UTF-8 contra XSS o bytes corruptos.
  * Inyección y propagación de metadatos de identidad (`user_id`, `role`, `trace_id`).
  * Validación de límites de tamaño de payload (máximo 4MB para audio chunks).

---

## 4. RATE LIMITING Y RESILIENCIA
* **Token Bucket en Redis**: Implementado en el BFF para prevenir ataques de fuerza bruta o saturación de API.
* **Límites por Endpoint**:
  * Endpoints de Auth (Login/Register): Máximo 5 peticiones/minuto por IP.
  * Endpoints de Examen IA: Máximo 30 peticiones/minuto por usuario.
  * Endpoints de Fonética & Lecciones: Máximo 120 peticiones/minuto por usuario.
