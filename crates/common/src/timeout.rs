use std::time::Duration;

/// Reads a positive duration in seconds from an environment variable.
///
/// Missing variables use the provided default. Invalid, zero, or excessive
/// values fail startup instead of silently disabling a timeout.
pub fn duration_from_env(
    name: &str,
    default_seconds: u64,
    max_seconds: u64,
) -> Result<Duration, std::io::Error> {
    if default_seconds == 0 || max_seconds == 0 || default_seconds > max_seconds {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "timeout defaults must be positive and not exceed the configured maximum",
        ));
    }

    let raw = std::env::var(name).unwrap_or_else(|_| default_seconds.to_string());
    duration_from_value(name, Some(&raw), default_seconds, max_seconds)
}

/// Pure parser used by startup configuration and unit tests.
pub fn duration_from_value(
    name: &str,
    value: Option<&str>,
    default_seconds: u64,
    max_seconds: u64,
) -> Result<Duration, std::io::Error> {
    if default_seconds == 0 || max_seconds == 0 || default_seconds > max_seconds {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "timeout defaults must be positive and not exceed the configured maximum",
        ));
    }

    let raw = value.unwrap_or_else(|| {
        // This branch is only used when a caller explicitly asks the pure
        // parser to apply its default.
        ""
    });
    let seconds = if value.is_none() {
        default_seconds
    } else {
        raw.parse::<u64>().map_err(|_| {
            std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("{name} must be an integer number of seconds"),
            )
        })?
    };

    if seconds == 0 || seconds > max_seconds {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("{name} must be between 1 and {max_seconds} seconds"),
        ));
    }

    Ok(Duration::from_secs(seconds))
}

#[cfg(test)]
mod tests {
    use super::{duration_from_value, Duration};

    #[test]
    fn uses_default_when_value_is_missing() {
        assert_eq!(
            duration_from_value("RPC_TIMEOUT_SECONDS", None, 10, 120).unwrap(),
            Duration::from_secs(10)
        );
    }

    #[test]
    fn accepts_valid_configured_timeout() {
        assert_eq!(
            duration_from_value("RPC_TIMEOUT_SECONDS", Some("25"), 10, 120).unwrap(),
            Duration::from_secs(25)
        );
    }

    #[test]
    fn rejects_zero_non_numeric_and_values_over_limit() {
        assert!(duration_from_value("RPC_TIMEOUT_SECONDS", Some("0"), 10, 120).is_err());
        assert!(duration_from_value("RPC_TIMEOUT_SECONDS", Some("slow"), 10, 120).is_err());
        assert!(duration_from_value("RPC_TIMEOUT_SECONDS", Some("121"), 10, 120).is_err());
    }

    #[test]
    fn rejects_invalid_default_and_maximum_relationship() {
        assert!(duration_from_value("RPC_TIMEOUT_SECONDS", None, 0, 120).is_err());
        assert!(duration_from_value("RPC_TIMEOUT_SECONDS", None, 121, 120).is_err());
    }
}
