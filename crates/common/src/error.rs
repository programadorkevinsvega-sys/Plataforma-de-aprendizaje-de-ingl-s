use thiserror::Error;

#[derive(Error, Debug)]
pub enum DomainError {
    #[error("Puntaje inválido: {0}. Debe estar entre 0.0 y 100.0")]
    InvalidScoreMetric(f32),

    #[error("Correo electrónico inválido: {0}")]
    InvalidEmail(String),

    #[error("Texto fonético no puede estar vacío")]
    EmptyPhoneticText,

    #[error("Error de base de datos: {0}")]
    DatabaseError(#[from] sqlx::Error),

    #[error("No autorizado o sesión expirada")]
    Unauthorized,

    #[error("Recurso no encontrado: {0}")]
    NotFound(String),

    #[error("Error de servicio externo: {0}")]
    ExternalServiceError(String),
}
