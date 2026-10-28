pub mod auth;
pub mod error;
pub mod rls;
pub mod vo;

pub use auth::{authenticated_user_id, ensure_authenticated_user, validate_jwt_configuration, JwtClaims, JwtValidationError, validate_jwt_token};
pub use error::DomainError;
pub use rls::set_current_user_id;
pub use vo::{Email, ScoreMetric, SpanishPhoneticText};

/// Parse a configurable listener address while keeping a safe loopback default.
pub fn parse_bind_addr(
    value: Option<&str>,
    default: &str,
) -> Result<std::net::SocketAddr, std::net::AddrParseError> {
    value.unwrap_or(default).parse()
}

#[cfg(test)]
mod bind_addr_tests {
    use super::parse_bind_addr;

    #[test]
    fn defaults_to_loopback_address() {
        let address = parse_bind_addr(None, "127.0.0.1:50051").unwrap();
        assert!(address.ip().is_loopback());
        assert_eq!(address.port(), 50051);
    }

    #[test]
    fn accepts_an_explicit_listener_address() {
        let address = parse_bind_addr(Some("0.0.0.0:50051"), "127.0.0.1:50051").unwrap();
        assert!(address.ip().is_unspecified());
        assert_eq!(address.port(), 50051);
    }

    #[test]
    fn rejects_malformed_listener_address() {
        assert!(parse_bind_addr(Some("not-an-address"), "127.0.0.1:50051").is_err());
    }
}
