# 📜 MANIFIESTO Y REGLAS DE DESARROLLO RUST: DevFluency AI (ENTERPRISE EDITION)

---

## 🎯 CONTEXTO Y PROPÓSITO
Este documento establece las normas inquebrantables de desarrollo en **Rust** para el ecosistema de **DevFluency AI**: la plataforma de aprendizaje de inglés conversacional con fonética en español natural diseñada para desarrolladores de software e ingenieros tech.

**Arquitectura objetivo**:
* **Patrón de Diseño**: Domain-Driven Design (DDD) + Clean Architecture.
* **Backend**: Microservicios en Rust (`Axum` para BFF, `tonic` para gRPC inter-servicios, `tokio` async runtime).
* **Event Bus**: NATS JetStream para streaming de eventos asíncronos.
* **Caché**: Redis Cluster (Token Bucket Rate Limiting, Hash de Sesiones).
* **Persistencia**: PostgreSQL 16 con políticas nativas de Row Level Security (RLS).
* **Motor Fonético**: Fonética en español natural (sin IPA/AFI) y evaluación adaptativa de 6 métricas con IA.

---

## 🚫 1. RESTRICCIONES DE HARDWARE Y MEMORIA EN RUST

### 1.1. Prevención de False Sharing
Cualquier estructura de datos concurrente mutada por múltiples hilos en el procesamiento de voz o cola de eventos debe estar obligatoriamente alineada a la línea de caché de la CPU:
```rust
#[repr(align(64))]
pub struct AudioStreamBuffer {
    pub chunk_id: u64,
    pub raw_pcm_data: [u8; 4096],
}
```

### 1.2. Atomic Memory Ordering Estricto
Prohibido usar `Ordering::SeqCst` por defecto por pereza. Debes usar `Ordering::Acquire`, `Release` o `Relaxed` siempre que sea posible, documentando la razón:
```rust
// ORDEN: Release garantiza que los bytes del chunk de audio están visibles antes de incrementar la posición
self.write_head.store(next_pos, Ordering::Release);
```

### 1.3. Asignadores de Memoria (Allocators)
El binario final de cada microservicio en Rust debe configurarse para usar `jemalloc` o `mimalloc` para evitar fragmentación de memoria durante cargas masivas de audio y gRPC:
```rust
#[global_allocator]
static GLOBAL: jemallocator::Jemalloc = jemallocator::Jemalloc;
```

---

## 🛡️ 2. EL PACTO DE "UNSAFE RUST" Y SEGURIDAD DE MEMORIA

### 2.1. Pruebas Matemáticas Obligatorias
Cada bloque `unsafe` (utilizado para optimizaciones críticas de I/O o buffers de audio) debe incluir obligatoriamente una prueba matemática formal en comentario multilínea `// SAFETY:`:

```rust
// SAFETY:
// 1. `buffer` está garantizado a no ser nulo y apunta a un chunk alineado de u8.
// 2. `len` no supera la capacidad máxima pre-asignada de 4096 bytes en el Arena Allocator.
// 3. Ningún otro hilo muta el buffer durante la conversión del espectro fonético.
unsafe {
    std::slice::from_raw_parts(buffer.as_ptr(), len)
}
```

### 2.2. Lifetimes Explícitos
Prohibido depender de la elisión implícita de lifetimes en estructuras de dominio complejas. Hazlos explícitos (`'a`, `'buf`) para demostrar la gestión explícita de referencias:
```rust
pub struct ContextSentenceSpan<'a> {
    pub english_text: &'a str,
    pub spanish_phonetic: &'a str,
}
```

---

## 🏛️ 3. ARQUITECTURA CLEAN & DDD EN MICROSERVICIOS

### 3.1. Estructura Interna Obligatoria por Crate/Microservicio
```text
src/
├── domain/                  # Lógica pura de negocio (Entidades, Value Objects, Traits)
├── application/             # Casos de uso (Use Cases, DTOs, Handlers)
├── infrastructure/          # Persistencia (SQLx, Redis), gRPC Clients, NATS
└── presentation/            # Servidores gRPC (tonic), HTTP handlers (Axum)
```

### 3.2. Cero JSON en Comunicación Interna
Toda comunicación inter-microservicio se realiza mediante **gRPC con Protocol Buffers (`tonic`)**. Queda terminantemente prohibido usar JSON en llamadas internas de red.

---

## 🔭 4. OBSERVABILIDAD Y TELEMETRÍA

### 4.1. Cero "Print Debugging"
Prohibido el uso de `println!` o `dbg!`. Todo el sistema debe instrumentarse con `tracing` y `opentelemetry`:
```rust
#[tracing::instrument(name = "evaluate_ai_exam_session", skip(repository))]
pub async fn execute(&self, request: EvaluateExamRequest) -> Result<ExamReportDto, ExamError> {
    tracing::info!(user_id = %request.user_id, "Iniciando evaluación de 6 métricas...");
    // ...
}
```

### 4.2. Matriz de Observabilidad RED/USE
* **Requests / Operaciones**: Rate (tasa), Errors (errores), Duration (latencia p50, p90, p99).
* **Recursos Hardware**: Utilization (uso CPU/RAM), Saturation (profundidad de colas NATS), Errors.

---

## 🔐 5. SEGURIDAD Y AISLAMIENTO MULTI-TENANT

### 5.1. Contexto de Aislamiento PostgreSQL RLS
Toda conexión a base de datos dentro de un caso de uso debe inyectar primero el identificador del usuario para activar el aislamiento RLS:
```rust
sqlx::query("SET LOCAL app.current_user_id = $1")
    .bind(user_id)
    .execute(&mut *conn)
    .await?;
```

### 5.2. Validación de Invariantes de Dominio en Value Objects
La entrada no desinfectada nunca debe cruzar a la capa de dominio. Usar Objetos de Valor auto-validados:
```rust
pub struct ScoreMetric(f32);

impl ScoreMetric {
    pub fn new(val: f32) -> Result<Self, DomainError> {
        if (0.0..=100.0).contains(&val) {
            Ok(Self(val))
        } else {
            Err(DomainError::InvalidScoreMetric(val))
        }
    }
}
```

---

## 🛑 6. DEFINITION OF DONE (DOD)

Un microservicio o funcionalidad solo se declara **COMPLETADA** si cumple:
1. Cobertura de pruebas estructurales al **100%** (`cargo test`).
2. Ausencia total de fugas o errores de memoria bajo **`cargo miri test`**.
3. Validado mediante **Property-based Testing (`proptest`)**.
4. Latencia de cola **P99 < 50ms** en el BFF y **P99 < 10ms** en gRPC interno.
5. Código compilado con cero warnings (`#[deny(warnings)]`).
