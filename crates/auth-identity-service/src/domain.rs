use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use common::{Email, DomainError};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Entidad de Dominio: Usuario
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub email: Email,
    pub password_hash: String,
    pub full_name: String,
    pub target_role: String,
    pub current_level: String,
}

impl User {
    pub fn new(
        email: Email,
        password_hash: String,
        full_name: String,
        target_role: String,
    ) -> Self {
        Self {
            id: Uuid::new_v4(),
            email,
            password_hash,
            full_name,
            target_role,
            current_level: "A1".to_string(),
        }
    }
}

/// Value Object: Hash de Contraseña con Argon2id
pub struct PasswordService;

impl PasswordService {
    pub fn hash_password(password: &str) -> Result<String, DomainError> {
        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        argon2
            .hash_password(password.as_bytes(), &salt)
            .map(|h| h.to_string())
            .map_err(|e| DomainError::NotFound(format!("Error generando hash Argon2: {}", e)))
    }

    pub fn verify_password(password: &str, password_hash: &str) -> bool {
        let parsed_hash = match PasswordHash::new(password_hash) {
            Ok(h) => h,
            Err(_) => return false,
        };
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok()
    }
}
