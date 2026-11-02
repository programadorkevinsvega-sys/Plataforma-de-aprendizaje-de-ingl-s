# Diagramas C4 — Fase 0

Los diagramas reflejan la arquitectura observada en el repositorio al 2026-11-01. Las cajas marcadas como configuradas/no conectadas no son dependencias de ejecución comprobadas. La topología externa Cloudflare Tunnel/nginx pertenece al entorno operativo descrito por el proyecto, pero no está definida dentro de estos archivos de aplicación.

## 1. Contexto

```mermaid
flowchart LR
    Student[Estudiante]
    Admin[Administrador de contenido / plataforma]
    Browser[Navegador]
    ExternalEdge[Cloudflare Tunnel / nginx<br/>ingress externo]
    Frontend[DevFluency Web<br/>Next.js]
    BFF[DevFluency BFF<br/>Axum HTTP + WebSocket]
    Student --> Browser
    Admin --> Browser
    Browser --> ExternalEdge
    ExternalEdge --> Frontend
    Frontend --> BFF
    BFF --> Services[Servicios de dominio Rust]
    Services --> Postgres[(PostgreSQL)]
    BFF --> Transcribe[AWS Transcribe]
    Services --> Bedrock[AWS Bedrock]
    Services --> TTS[AWS Polly / Cloudflare Workers AI]
    Redis[Redis<br/>configurado, uso no demostrado]
    Nats[NATS JetStream<br/>configurado, uso no demostrado]
    Redis -. no conectado en código inspeccionado .- BFF
    Nats -. no conectado en código inspeccionado .- Services
```

## 2. Contenedores / unidades desplegables

```mermaid
flowchart TB
    subgraph Browser["Dispositivo del usuario"]
        UI[Next.js UI]
        Media[MediaDevices + AudioWorklet]
        UI --- Media
    end
    subgraph AppVM["Aplicación Ubuntu / systemd"]
        FE[Frontend standalone<br/>127.0.0.1:3000]
        BFF[BFF Axum<br/>127.0.0.1:8080]
        AUTH[auth-identity-service<br/>gRPC :50051]
        CONTENT[content-vocabulary-service<br/>gRPC :50052]
        AI[ai-evaluator-service<br/>gRPC :50053]
        AUDIO[phonetic-audio-service<br/>gRPC :50054]
        SRS[srs-engine-service<br/>gRPC :50055]
        GAME[gamification-progress-service<br/>gRPC :50056]
        BFF --> AUTH
        BFF --> CONTENT
        BFF --> AI
        BFF --> AUDIO
        BFF --> SRS
        BFF --> GAME
    end
    subgraph DataVM["Base de datos"]
        PG[(PostgreSQL)]
    end
    UI --> FE
    UI --> BFF
    AUTH --> PG
    CONTENT --> PG
    SRS --> PG
    GAME --> PG
    AI --> Bedrock[AWS Bedrock]
    AUDIO --> Polly[AWS Polly o Cloudflare TTS]
    BFF --> STT[AWS Transcribe Streaming]
```

Los puertos de servicio se enlazan por defecto a loopback; la separación de VMs, direcciones privadas y túnel de ingress debe verificarse contra el EnvironmentFile y la infraestructura real antes de cambiar bind addresses.

## 3. Componentes del BFF y dominios

```mermaid
flowchart TB
    HTTP[Axum Router]
    HTTP --> AuthHandler[auth_handler]
    HTTP --> ContentHandler[content_handler]
    HTTP --> ExamHandler[exam_handler]
    HTTP --> ProgressHandler[progress_handler]
    HTTP --> SrsHandler[srs_handler]
    HTTP --> UserHandler[user_handler]
    HTTP --> Limiter[request_limiter<br/>ventana deslizante local]
    AuthHandler --> AuthRPC[Auth gRPC client]
    ContentHandler --> ContentRPC[Content gRPC client]
    ContentHandler --> AudioRPC[Audio gRPC client]
    ExamHandler --> ContentRPC
    ExamHandler --> AIRPC[AI Evaluator gRPC client]
    ExamHandler --> STT[WebSocket → AWS Transcribe]
    ProgressHandler --> SrsRPC[SRS gRPC client]
    ProgressHandler --> GameRPC[Gamification gRPC client]
    SrsHandler --> SrsRPC
    UserHandler --> AuthRPC
    UserHandler --> GameRPC
    ContentHandler --> Limiter
    ExamHandler --> Limiter
```

## 4. Componentes internos relevantes

```mermaid
flowchart LR
    subgraph Evaluator["AI Evaluator"]
        Metrics[ExamMetrics<br/>6 scores + weighted total]
        Prompt[Prompt textual]
        Bedrock[Bedrock Runtime]
        Metrics --> Prompt --> Bedrock
    end
    subgraph Audio["Phonetic Audio"]
        Phonetic[PhoneticEngine<br/>dictionary + fallback]
        TTS[TtsEngine<br/>AWS Polly / Cloudflare]
        AudioRpc[PhoneticAudioService]
        AudioRpc --> Phonetic
        AudioRpc --> TTS
    end
    subgraph Gamification["Gamification"]
        Progress[RecordLearningProgress]
        Ledger[(learning_progress_events)]
        Stats[(user_stats)]
        Progress --> Ledger
        Progress --> Stats
    end
```

## 5. Elementos fuera del alcance actual

No se dibujan Course/Lesson/Activity/Mastery, Conversation/Turn, Event Outbox ni Redis/NATS como contenedores conectados porque no se encontraron implementaciones activas suficientes. Deben añadirse a los diagramas cuando sean aprobados e implementados, con contratos y pruebas asociados.
