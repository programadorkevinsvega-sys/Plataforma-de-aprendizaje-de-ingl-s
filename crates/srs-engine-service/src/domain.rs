use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrsItem {
    pub easiness_factor: f32,
    pub interval_days: i32,
    pub repetitions: i32,
    pub next_review: DateTime<Utc>,
}

impl Default for SrsItem {
    fn default() -> Self {
        Self {
            easiness_factor: 2.5,
            interval_days: 1,
            repetitions: 0,
            next_review: Utc::now(),
        }
    }
}

pub struct AnkiSm2Engine;

impl AnkiSm2Engine {
    /// Algoritmo Anki SM-2 (SuperMemo 2):
    /// rating: 0 = Repetir, 3 = Difícil, 4 = Bueno, 5 = Fácil
    pub fn calculate_next_review(item: &SrsItem, rating: u8) -> SrsItem {
        let q = rating.clamp(0, 5) as f32;

        let new_ef = item.easiness_factor + (0.1 - (5.0 - q) * (0.08 + (5.0 - q) * 0.02));
        let new_ef = new_ef.max(1.3); // El Easiness Factor mínimo según SM-2 es 1.3

        let (new_reps, new_interval) = if q < 3.0 {
            (0, 1) // Si falló (rating < 3), reiniciar repeticiones e intervalo a 1 día
        } else {
            let reps = item.repetitions + 1;
            let interval = match reps {
                1 => 1,
                2 => 6,
                _ => (item.interval_days as f32 * new_ef).round() as i32,
            };
            (reps, interval)
        };

        let next_review = Utc::now() + Duration::days(new_interval as i64);

        SrsItem {
            easiness_factor: new_ef,
            interval_days: new_interval,
            repetitions: new_reps,
            next_review,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_anki_sm2_first_successful_review() {
        let item = SrsItem::default();
        let updated = AnkiSm2Engine::calculate_next_review(&item, 4); // Bueno
        assert_eq!(updated.repetitions, 1);
        assert_eq!(updated.interval_days, 1);
        assert!(updated.easiness_factor >= 2.5);
    }

    #[test]
    fn test_anki_sm2_failed_review_resets_interval() {
        let mut item = SrsItem::default();
        item.repetitions = 5;
        item.interval_days = 20;

        let updated = AnkiSm2Engine::calculate_next_review(&item, 1); // Falló (rating < 3)
        assert_eq!(updated.repetitions, 0);
        assert_eq!(updated.interval_days, 1);
    }
}
