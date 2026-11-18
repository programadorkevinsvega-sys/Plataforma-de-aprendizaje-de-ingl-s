use crate::error::DomainError;
use serde::{Deserialize, Serialize};

/// Value Object: Puntaje de Métricas (0.0% a 100.0%)
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct ScoreMetric(f32);

impl ScoreMetric {
    pub fn new(val: f32) -> Result<Self, DomainError> {
        if (0.0..=100.0).contains(&val) {
            Ok(Self(val))
        } else {
            Err(DomainError::InvalidScoreMetric(val))
        }
    }

    pub fn value(&self) -> f32 {
        self.0
    }
}

/// Value Object: Texto Fonético Adaptado al Español Natural
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SpanishPhoneticText(String);

impl SpanishPhoneticText {
    pub fn new(text: impl Into<String>) -> Result<Self, DomainError> {
        let s = text.into().trim().to_string();
        if s.is_empty() {
            return Err(DomainError::EmptyPhoneticText);
        }
        Ok(Self(s))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Value Object: Correo Electrónico Validado
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Email(String);

impl Email {
    pub fn parse(email: impl Into<String>) -> Result<Self, DomainError> {
        let s = email.into().trim().to_string();
        if s.contains('@') && s.contains('.') && s.len() >= 5 {
            Ok(Self(s.to_lowercase()))
        } else {
            Err(DomainError::InvalidEmail(s))
        }
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}
