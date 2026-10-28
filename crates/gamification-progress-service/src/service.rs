use crate::domain::UserGamificationStats;
use proto::gamification::gamification_service_server::GamificationService;
use proto::gamification::{
    AddXpRequest, GetUserStatsRequest, InitUserStatsRequest, RecordLearningProgressRequest,
    UserStatsResponse,
};
use sqlx::PgPool;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

pub struct MyGamificationService {
    pub pool: Arc<PgPool>,
}

impl MyGamificationService {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

fn level_from_xp(xp: i32) -> &'static str {
    match xp {
        0..=499 => "A0",
        500..=1499 => "A1",
        1500..=3499 => "A2",
        3500..=6999 => "B1",
        7000..=11999 => "B2",
        _ => "C1",
    }
}

#[tonic::async_trait]
impl GamificationService for MyGamificationService {
    async fn get_user_stats(
        &self,
        request: Request<GetUserStatsRequest>,
    ) -> Result<Response<UserStatsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;

        let row: Option<(i32, i32, i32, i32, i32)> = sqlx::query_as(
            "SELECT xp, streak_days, coins, words_learned, sentences_mastered FROM user_stats WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (xp, streak, coins, words, sentences) = row.unwrap_or((0, 0, 50, 0, 0));

        Ok(Response::new(UserStatsResponse {
            user_id: user_id.to_string(),
            xp,
            streak_days: streak,
            coins,
            words_learned: words,
            sentences_mastered: sentences,
            current_level: level_from_xp(xp).to_string(),
        }))
    }

    async fn add_xp(
        &self,
        request: Request<AddXpRequest>,
    ) -> Result<Response<UserStatsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();

        let mut domain_stats = UserGamificationStats::new(user_id);
        domain_stats.add_xp(req.xp_amount);

        let row: Option<(i32, i32, i32, i32, i32)> = sqlx::query_as(
            r#"
            INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered)
            VALUES ($1, $2, 1, $3, $4, 0)
            ON CONFLICT (user_id) DO UPDATE
            SET xp = user_stats.xp + $2,
                coins = user_stats.coins + $3,
                words_learned = user_stats.words_learned + $4,
                updated_at = NOW()
            RETURNING xp, streak_days, coins, words_learned, sentences_mastered
            "#,
        )
        .bind(user_id)
        .bind(req.xp_amount)
        .bind(domain_stats.coins - 50)
        .bind(req.words_learned_delta)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (xp, streak, coins, words, sentences) = row.unwrap_or((req.xp_amount, 1, domain_stats.coins, req.words_learned_delta, 0));

        Ok(Response::new(UserStatsResponse {
            user_id: user_id.to_string(),
            xp,
            streak_days: streak,
            coins,
            words_learned: words,
            sentences_mastered: sentences,
            current_level: level_from_xp(xp).to_string(),
        }))
    }

    async fn record_learning_progress(
        &self,
        request: Request<RecordLearningProgressRequest>,
    ) -> Result<Response<UserStatsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();

        let row: Option<(i32, i32, i32, i32, i32)> = sqlx::query_as(
            r#"
            INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered, last_study_date)
            VALUES ($1, $2, 1, $3, $4, 0, CURRENT_DATE)
            ON CONFLICT (user_id) DO UPDATE
            SET xp = user_stats.xp + $2,
                coins = user_stats.coins + $3,
                words_learned = user_stats.words_learned + $4,
                streak_days = CASE 
                    WHEN user_stats.last_study_date = CURRENT_DATE THEN user_stats.streak_days
                    WHEN user_stats.last_study_date = CURRENT_DATE - INTERVAL '1 day' THEN user_stats.streak_days + 1
                    ELSE 1
                END,
                last_study_date = CURRENT_DATE,
                updated_at = NOW()
            RETURNING xp, streak_days, coins, words_learned, sentences_mastered
            "#,
        )
        .bind(user_id)
        .bind(req.xp_amount)
        .bind(req.coins_amount)
        .bind(req.words_learned_delta)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (xp, streak, coins, words, sentences) = row.unwrap_or((req.xp_amount, 1, req.coins_amount + 50, req.words_learned_delta, 0));

        Ok(Response::new(UserStatsResponse {
            user_id: user_id.to_string(),
            xp,
            streak_days: streak,
            coins,
            words_learned: words,
            sentences_mastered: sentences,
            current_level: level_from_xp(xp).to_string(),
        }))
    }

    async fn init_user_stats(
        &self,
        request: Request<InitUserStatsRequest>,
    ) -> Result<Response<UserStatsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;

        sqlx::query(
            "INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered) VALUES ($1, 0, 0, 50, 0, 0) ON CONFLICT (user_id) DO NOTHING"
        )
        .bind(user_id)
        .execute(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(UserStatsResponse {
            user_id: user_id.to_string(),
            xp: 0,
            streak_days: 0,
            coins: 50,
            words_learned: 0,
            sentences_mastered: 0,
            current_level: "A0".to_string(),
        }))
    }

    async fn get_leaderboard(
        &self,
        request: Request<proto::gamification::GetLeaderboardRequest>,
    ) -> Result<Response<proto::gamification::LeaderboardResponse>, Status> {
        common::authenticated_user_id(&request)?;
        let req = request.into_inner();
        let limit = if req.limit <= 0 { 50 } else { req.limit };

        let rows: Vec<(Uuid, String, String, i32, i32)> = sqlx::query_as(
            r#"
            SELECT u.id, u.full_name, u.current_level, s.xp, s.streak_days
            FROM user_stats s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.xp DESC
            LIMIT $1
            "#,
        )
        .bind(limit as i64)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let entries = rows
            .into_iter()
            .map(|(id, full_name, current_level, xp, streak_days)| {
                proto::gamification::LeaderboardEntry {
                    user_id: id.to_string(),
                    full_name,
                    current_level,
                    xp,
                    streak_days,
                }
            })
            .collect();

        Ok(Response::new(proto::gamification::LeaderboardResponse {
            entries,
        }))
    }

    async fn get_user_achievements(
        &self,
        request: Request<proto::gamification::GetUserAchievementsRequest>,
    ) -> Result<Response<proto::gamification::UserAchievementsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;

        // 1. Get user_stats
        let stats_row: Option<(i32, i32, i32)> = sqlx::query_as(
            "SELECT xp, streak_days, words_learned FROM user_stats WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (xp, streak_days, words_learned) = stats_row.unwrap_or((0, 0, 0));

        // 2. Get ai_exam_sessions stats
        let exam_row: Option<(i64, f64, f64)> = sqlx::query_as(
            "SELECT COUNT(*), COALESCE(MAX(total_score), 0.0), COALESCE(MAX(score_pronunciation), 0.0) FROM ai_exam_sessions WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (total_exams, max_score, max_pronunciation) = exam_row.unwrap_or((0, 0.0, 0.0));

        // 3. Get srs progress count
        let srs_row: Option<(i64,)> = sqlx::query_as(
            "SELECT COUNT(*) FROM user_srs_progress WHERE user_id = $1 AND repetitions > 0"
        )
        .bind(user_id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let srs_cards = srs_row.unwrap_or((0,)).0 as i32;

        // Consultar logros dinámicamente desde la tabla `achievements` de PostgreSQL
        let db_achievements: Vec<(String, String, String, String, i32, String)> = sqlx::query_as(
            "SELECT id, emoji, title, description, max_progress, category FROM achievements ORDER BY id"
        )
        .fetch_all(self.pool.as_ref())
        .await
        .unwrap_or_default();

        let mut achievements = Vec::new();

        for (id, emoji, title, description, max_progress, category) in db_achievements {
            let user_val = match id.as_str() {
                "first-word" => words_learned,
                "streak-7" | "streak-30" => streak_days,
                "first-interview" => total_exams as i32,
                "90-percent" => max_score as i32,
                "100-words" => words_learned,
                "level-b1" => xp,
                "srs-50" => srs_cards,
                "perfect-pronunciation" => max_pronunciation as i32,
                _ => 0,
            };

            let unlocked = user_val >= max_progress;
            let progress = user_val.min(max_progress);

            achievements.push(proto::gamification::Achievement {
                id,
                emoji,
                title,
                description,
                unlocked,
                progress,
                max_progress,
                category,
            });
        }

        Ok(Response::new(proto::gamification::UserAchievementsResponse {
            achievements,
        }))
    }
}
