use std::{
    collections::{HashMap, VecDeque},
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

static REQUESTS: OnceLock<Mutex<HashMap<String, VecDeque<Instant>>>> = OnceLock::new();

/// In-process sliding-window limiter for authenticated, cost-generating routes.
/// Production deployments with multiple replicas should back this with a shared
/// atomic store (for example Redis); this local limit is defense in depth only.
fn allow_request_at(
    user_id: &str,
    operation: &str,
    limit: usize,
    window: Duration,
    now: Instant,
) -> bool {
    if limit == 0 || user_id.trim().is_empty() {
        return false;
    }

    let requests = REQUESTS.get_or_init(|| Mutex::new(HashMap::new()));
    let Ok(mut requests) = requests.lock() else {
        // Fail closed if the limiter state cannot be safely accessed.
        return false;
    };

    requests.retain(|_, times| {
        while times
            .front()
            .is_some_and(|time| now.saturating_duration_since(*time) >= window)
        {
            times.pop_front();
        }
        !times.is_empty()
    });

    let key = format!("{operation}:{user_id}");
    let times = requests.entry(key).or_default();
    if times.len() >= limit {
        return false;
    }

    times.push_back(now);
    true
}

pub(crate) fn allow_request(
    user_id: &str,
    operation: &str,
    limit: usize,
    window: Duration,
) -> bool {
    allow_request_at(user_id, operation, limit, window, Instant::now())
}

#[cfg(test)]
mod tests {
    use super::allow_request_at;
    use std::time::{Duration, Instant};
    use uuid::Uuid;

    #[test]
    fn blocks_requests_after_the_per_user_operation_limit() {
        let user = Uuid::new_v4().to_string();
        let now = Instant::now();
        assert!(allow_request_at(&user, "tts", 2, Duration::from_secs(60), now));
        assert!(allow_request_at(&user, "tts", 2, Duration::from_secs(60), now));
        assert!(!allow_request_at(&user, "tts", 2, Duration::from_secs(60), now));
    }

    #[test]
    fn operations_have_independent_quotas() {
        let user = Uuid::new_v4().to_string();
        let now = Instant::now();
        assert!(allow_request_at(&user, "tts", 1, Duration::from_secs(60), now));
        assert!(allow_request_at(&user, "llm", 1, Duration::from_secs(60), now));
    }

    #[test]
    fn quota_resets_after_the_sliding_window() {
        let user = Uuid::new_v4().to_string();
        let now = Instant::now();
        let window = Duration::from_secs(60);
        assert!(allow_request_at(&user, "llm", 1, window, now));
        assert!(!allow_request_at(&user, "llm", 1, window, now));
        assert!(allow_request_at(
            &user,
            "llm",
            1,
            window,
            now + Duration::from_secs(61),
        ));
    }

    #[test]
    fn empty_identity_and_zero_quota_fail_closed() {
        let now = Instant::now();
        assert!(!allow_request_at(" ", "llm", 1, Duration::from_secs(60), now));
        assert!(!allow_request_at("user", "llm", 0, Duration::from_secs(60), now));
    }
}
