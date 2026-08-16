use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserGamificationStats {
    pub user_id: Uuid,
    pub xp: i32,
    pub streak_days: i32,
    pub coins: i32,
    pub words_learned: i32,
    pub sentences_mastered: i32,
}

impl UserGamificationStats {
    pub fn new(user_id: Uuid) -> Self {
        Self {
            user_id,
            xp: 0,
            streak_days: 1,
            coins: 50,
            words_learned: 0,
            sentences_mastered: 0,
        }
    }

    pub fn add_xp(&mut self, amount: i32) {
        self.xp += amount;
        self.coins += amount / 5;
    }

    pub fn get_level(&self) -> &'static str {
        match self.xp {
            0..=499 => "A0 (Principiante)",
            500..=1499 => "A1 (Básico)",
            1500..=3499 => "A2 (Standups & Remoto)",
            3500..=6999 => "B1 (Code Review & PRs)",
            7000..=11999 => "B2 (System Design & Entrevistas)",
            _ => "C1 (Liderazgo & Enterprise)",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_gamification_xp_and_level_progression() {
        let mut stats = UserGamificationStats::new(Uuid::new_v4());
        assert_eq!(stats.get_level(), "A0 (Principiante)");

        stats.add_xp(2000);
        assert_eq!(stats.get_level(), "A2 (Standups & Remoto)");
        assert_eq!(stats.coins, 450); // 50 iniciales + (2000/5 = 400)
    }
}
