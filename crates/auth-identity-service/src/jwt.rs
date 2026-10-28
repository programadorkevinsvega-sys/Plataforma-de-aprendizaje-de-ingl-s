use common::DomainError;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

fn get_jwt_secret() -> Result<String, DomainError> {
    parse_jwt_secret(std::env::var("JWT_SECRET").ok())
}

fn parse_jwt_secret(secret: Option<String>) -> Result<String, DomainError> {
    let secret = secret
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            DomainError::ExternalServiceError("JWT_SECRET debe estar configurado".to_string())
        })?;

    if secret.as_bytes().len() < 32 {
        return Err(DomainError::ExternalServiceError(
            "JWT_SECRET debe tener al menos 32 bytes".to_string(),
        ));
    }

    Ok(secret)
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
    /// Valida la configuración de JWT durante el arranque del servicio.
    pub fn validate_configuration() -> Result<(), DomainError> {
        get_jwt_secret().map(|_| ())
    }

    pub fn generate_token(user_id: Uuid, email: &str, role: &str) -> Result<String, DomainError> {
        let secret = get_jwt_secret()?;
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
        let secret = get_jwt_secret()?;
        let token_data = decode::<Claims>(
            token,
            &DecodingKey::from_secret(secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| DomainError::Unauthorized)?;

        Ok(token_data.claims)
    }
}


#[cfg(test)]
mod tests {
    use super::parse_jwt_secret;

    #[test]
    fn rejects_missing_or_empty_secret() {
        assert!(parse_jwt_secret(None).is_err());
        assert!(parse_jwt_secret(Some(String::new())).is_err());
        assert!(parse_jwt_secret(Some("   ".to_string())).is_err());
    }

    #[test]
    fn rejects_secret_shorter_than_32_bytes() {
        assert!(parse_jwt_secret(Some("too-short".to_string())).is_err());
    }

    #[test]
    fn accepts_secret_with_at_least_32_bytes() {
        let secret = "a".repeat(32);
        assert_eq!(parse_jwt_secret(Some(secret.clone())).unwrap(), secret);
    }
}
