use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tonic::{Request, Status};
use uuid::Uuid;

/// Claims emitted by the auth-identity service.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct JwtClaims {
    pub sub: String,
    pub email: String,
    pub role: String,
    pub exp: usize,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum JwtValidationError {
    #[error("JWT_SECRET debe estar configurado")]
    MissingSecret,
    #[error("JWT_SECRET debe tener al menos 32 bytes")]
    WeakSecret,
    #[error("JWT inválido o expirado")]
    InvalidToken,
}

/// Fails fast when the shared JWT secret is absent, blank, or too short.
pub fn validate_jwt_configuration() -> Result<(), JwtValidationError> {
    let secret = std::env::var("JWT_SECRET").map_err(|_| JwtValidationError::MissingSecret)?;
    validate_secret(&secret)
}

fn validate_secret(secret: &str) -> Result<(), JwtValidationError> {
    if secret.trim().is_empty() {
        return Err(JwtValidationError::MissingSecret);
    }
    if secret.as_bytes().len() < 32 {
        return Err(JwtValidationError::WeakSecret);
    }
    Ok(())
}

fn validate_jwt_token_with_secret(
    token: &str,
    secret: &str,
) -> Result<JwtClaims, JwtValidationError> {
    validate_secret(secret)?;
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    validation.required_spec_claims.insert("sub".to_string());
    validation.required_spec_claims.insert("email".to_string());
    validation.required_spec_claims.insert("role".to_string());

    decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|_| JwtValidationError::InvalidToken)
}

/// Validates a JWT using the configured secret and an explicit HS256 allowlist.
/// Error messages intentionally never include the token or secret.
pub fn validate_jwt_token(token: &str) -> Result<JwtClaims, JwtValidationError> {
    let secret = std::env::var("JWT_SECRET").map_err(|_| JwtValidationError::MissingSecret)?;
    validate_jwt_token_with_secret(token, &secret)
}

/// Validates a bearer JWT and ensures its subject equals the requested user ID.
/// Call this inside any gRPC method that accepts a user ID from its request body.
pub fn ensure_authenticated_user<T>(
    request: &Request<T>,
    requested_user_id: &str,
) -> Result<Uuid, Status> {
    let secret = std::env::var("JWT_SECRET")
        .map_err(|_| Status::unavailable("La autenticación no está configurada"))?;
    ensure_authenticated_user_with_secret(request, requested_user_id, &secret)
}

/// Validates a bearer JWT and returns its signed subject UUID.
pub fn authenticated_user_id<T>(request: &Request<T>) -> Result<Uuid, Status> {
    let secret = std::env::var("JWT_SECRET")
        .map_err(|_| Status::unavailable("La autenticación no está configurada"))?;
    authenticated_user_id_with_secret(request, &secret)
}

fn authenticated_user_id_with_secret<T>(
    request: &Request<T>,
    secret: &str,
) -> Result<Uuid, Status> {
    let token = request
        .metadata()
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| Status::unauthenticated("Token de usuario requerido"))?;
    let claims = validate_jwt_token_with_secret(token, secret)
        .map_err(|_| Status::unauthenticated("Token de usuario inválido"))?;
    Uuid::parse_str(&claims.sub)
        .map_err(|_| Status::unauthenticated("Identidad de usuario inválida"))
}

fn ensure_authenticated_user_with_secret<T>(
    request: &Request<T>,
    requested_user_id: &str,
    secret: &str,
) -> Result<Uuid, Status> {
    let authenticated_id = authenticated_user_id_with_secret(request, secret)?;
    let requested_id = Uuid::parse_str(requested_user_id)
        .map_err(|_| Status::invalid_argument("user_id inválido"))?;

    if authenticated_id != requested_id {
        return Err(Status::permission_denied(
            "No puedes acceder a los datos de otro usuario",
        ));
    }

    Ok(authenticated_id)
}

#[cfg(test)]
mod tests {
    use super::{
        ensure_authenticated_user_with_secret, validate_jwt_token_with_secret, JwtClaims,
        JwtValidationError,
    };
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use tonic::{metadata::MetadataValue, Code, Request};
    use uuid::Uuid;

    const SECRET: &str = "0123456789abcdef0123456789abcdef";

    fn future_exp() -> usize {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as usize + 60
    }

    fn make_token(secret: &str, sub: &str, exp: usize, algorithm: Algorithm) -> String {
        let claims = JwtClaims {
            sub: sub.to_string(),
            email: "test@example.invalid".to_string(),
            role: "learner".to_string(),
            exp,
        };
        encode(
            &Header::new(algorithm),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    fn request_with_token(token: &str) -> Request<()> {
        let mut request = Request::new(());
        request.metadata_mut().insert(
            "authorization",
            MetadataValue::try_from(format!("Bearer {token}")).unwrap(),
        );
        request
    }

    #[test]
    fn rejects_missing_and_weak_secrets() {
        assert_eq!(
            validate_jwt_token_with_secret("not-a-token", ""),
            Err(JwtValidationError::MissingSecret)
        );
        assert_eq!(
            validate_jwt_token_with_secret("not-a-token", "too-short"),
            Err(JwtValidationError::WeakSecret)
        );
    }

    #[test]
    fn accepts_a_valid_hs256_token() {
        let user = Uuid::new_v4();
        let token = make_token(
            SECRET,
            &user.to_string(),
            future_exp(),
            Algorithm::HS256,
        );
        let claims = validate_jwt_token_with_secret(&token, SECRET).unwrap();
        assert_eq!(claims.sub, user.to_string());
    }

    #[test]
    fn rejects_expired_tokens() {
        let token = make_token(SECRET, &Uuid::new_v4().to_string(), 1, Algorithm::HS256);
        assert_eq!(
            validate_jwt_token_with_secret(&token, SECRET),
            Err(JwtValidationError::InvalidToken)
        );
    }

    #[test]
    fn rejects_tokens_signed_with_another_secret_or_algorithm() {
        let token = make_token(
            "fedcba9876543210fedcba9876543210",
            &Uuid::new_v4().to_string(),
            future_exp(),
            Algorithm::HS256,
        );
        assert_eq!(
            validate_jwt_token_with_secret(&token, SECRET),
            Err(JwtValidationError::InvalidToken)
        );

        let token = make_token(
            SECRET,
            &Uuid::new_v4().to_string(),
            future_exp(),
            Algorithm::HS512,
        );
        assert_eq!(
            validate_jwt_token_with_secret(&token, SECRET),
            Err(JwtValidationError::InvalidToken)
        );
    }

    #[test]
    fn denies_a_token_scoped_to_a_different_user() {
        let user_a = Uuid::new_v4();
        let user_b = Uuid::new_v4();
        let token = make_token(
            SECRET,
            &user_a.to_string(),
            future_exp(),
            Algorithm::HS256,
        );
        let error = ensure_authenticated_user_with_secret(
            &request_with_token(&token),
            &user_b.to_string(),
            SECRET,
        )
        .unwrap_err();
        assert_eq!(error.code(), Code::PermissionDenied);
    }

    #[test]
    fn rejects_missing_bearer_metadata() {
        let error = ensure_authenticated_user_with_secret(
            &Request::new(()),
            &Uuid::new_v4().to_string(),
            SECRET,
        )
        .unwrap_err();
        assert_eq!(error.code(), Code::Unauthenticated);
    }
}
