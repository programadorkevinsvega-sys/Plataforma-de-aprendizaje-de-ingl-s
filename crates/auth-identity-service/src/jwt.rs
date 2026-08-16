use common::DomainError;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

fn get_jwt_secret() -> String {
    std::env::var("JWT_SECRET")
        .unwrap_or_else(|_| "devfluency_super_secret_jwt_key_2026_enterprise_production".to_string())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: usize,
}

pub struct JwtService;

impl JwtService {
    pub fn generate_token(user_id: Uuid, email: &str, role: &str) -> Result<String, DomainError> {
        let secret = get_jwt_secret();
        let expiration = chrono::Utc::now()
            .checked_add_signed(chrono::Duration::hours(24))
            .expect("Timestamp válido")
            .timestamp() as usize;

        let claims = Claims {
            sub: user_id.to_string(),
            email: email.to_string(),
            role: if role.is_empty() { "Software Engineer".to_string() } else { role.to_string() },
            exp: expiration,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .map_err(|e| DomainError::NotFound(format!("Error generando JWT: {}", e)))
    }

    pub fn validate_token(token: &str) -> Result<Claims, DomainError> {
        let secret = get_jwt_secret();
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| DomainError::Unauthorized)?;

        Ok(token_data.claims)
    }
}
