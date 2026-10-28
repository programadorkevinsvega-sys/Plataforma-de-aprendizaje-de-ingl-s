use crate::domain::UserGamificationStats;
use proto::gamification::gamification_service_server::GamificationService;
use proto::gamification::{
    AddXpRequest, GetUserStatsRequest, InitUserStatsRequest, RecordLearningProgressRequest,
    RecordLearningProgressResponse, UserStatsResponse,
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
        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta de estadísticas"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

        let row: Option<(i32, i32, i32, i32, i32)> = sqlx::query_as(
            "SELECT xp, streak_days, coins, words_learned, sentences_mastered FROM user_stats WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudieron consultar las estadísticas"))?;
        tx.commit().await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta de estadísticas"))?;

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
        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar la actualización de XP"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

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
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo actualizar XP"))?;
        tx.commit().await
            .map_err(|_| Status::internal("No se pudo confirmar XP"))?;

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
    ) -> Result<Response<RecordLearningProgressResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();

        // Reward values are server-defined; authenticated gRPC callers cannot
        // choose arbitrary XP/coins deltas.
        if req.xp_amount != 10 || req.coins_amount != 2 || req.words_learned_delta != 1 {
            return Err(Status::invalid_argument("Parámetros de recompensa no permitidos"));
        }

        let word_id = Uuid::parse_str(&req.word_id)
            .map_err(|_| Status::invalid_argument("word_id inválido"))?;

        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar el registro de progreso"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

        // An idempotency key must refer to a real vocabulary word. The event
        // ledger's unique (user_id, word_id) key makes retries and races safe.
        let word_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM vocabulary_words WHERE id = $1)"
        )
        .bind(word_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo validar la palabra"))?;
        if !word_exists {
            return Err(Status::not_found("Palabra de vocabulario no encontrada"));
        }

        let inserted: Option<Uuid> = sqlx::query_scalar(
            r#"
            INSERT INTO learning_progress_events
                (user_id, word_id, xp_amount, coins_amount, words_learned_delta)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, word_id) DO NOTHING
            RETURNING word_id
            "#,
        )
        .bind(user_id)
        .bind(word_id)
        .bind(req.xp_amount)
        .bind(req.coins_amount)
        .bind(req.words_learned_delta)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo registrar el evento de progreso"))?;

        if inserted.is_none() {
            let prior: Option<(i32, i32, i32)> = sqlx::query_as(
                "SELECT xp_amount, coins_amount, words_learned_delta FROM learning_progress_events WHERE user_id = $1 AND word_id = $2"
            )
            .bind(user_id)
            .bind(word_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudo verificar el evento de progreso"))?;

            let (prior_xp, prior_coins, prior_words) = prior
                .ok_or_else(|| Status::internal("El evento de progreso no está disponible"))?;
            if (prior_xp, prior_coins, prior_words)
                != (req.xp_amount, req.coins_amount, req.words_learned_delta)
            {
                return Err(Status::already_exists(
                    "La palabra ya fue procesada con otros parámetros de recompensa",
                ));
            }

            let row: Option<(i32, i32, i32, i32, i32)> = sqlx::query_as(
                "SELECT xp, streak_days, coins, words_learned, sentences_mastered FROM user_stats WHERE user_id = $1"
            )
            .bind(user_id)
            .fetch_optional(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudieron consultar las estadísticas"))?;
            let (xp, streak, coins, words, sentences) = row
                .ok_or_else(|| Status::failed_precondition("No existen estadísticas para el evento repetido"))?;

            tx.commit().await
                .map_err(|_| Status::internal("No se pudo cerrar el registro repetido"))?;

            return Ok(Response::new(RecordLearningProgressResponse {
                stats: Some(UserStatsResponse {
                    user_id: user_id.to_string(),
                    xp,
                    streak_days: streak,
                    coins,
                    words_learned: words,
                    sentences_mastered: sentences,
                    current_level: level_from_xp(xp).to_string(),
                }),
                xp_gained: 0,
                coins_gained: 0,
                applied: false,
            }));
        }

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
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo registrar el progreso"))?;
        let (xp, streak, coins, words, sentences) = row
            .ok_or_else(|| Status::internal("No se pudieron recuperar las estadísticas actualizadas"))?;

        tx.commit().await
            .map_err(|_| Status::internal("No se pudo confirmar el progreso"))?;

        Ok(Response::new(RecordLearningProgressResponse {
            stats: Some(UserStatsResponse {
                user_id: user_id.to_string(),
                xp,
                streak_days: streak,
                coins,
                words_learned: words,
                sentences_mastered: sentences,
                current_level: level_from_xp(xp).to_string(),
            }),
            xp_gained: req.xp_amount,
            coins_gained: req.coins_amount,
            applied: true,
        }))
    }

    async fn init_user_stats(
        &self,
        request: Request<InitUserStatsRequest>,
    ) -> Result<Response<UserStatsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar la inicialización de estadísticas"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

        sqlx::query(
            "INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered) VALUES ($1, 0, 0, 50, 0, 0) ON CONFLICT (user_id) DO NOTHING"
        )
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudieron inicializar las estadísticas"))?;
        tx.commit().await
            .map_err(|_| Status::internal("No se pudo confirmar la inicialización"))?;

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
        let user_id = common::authenticated_user_id(&request)?;
        let req = request.into_inner();
        let limit = if req.limit <= 0 { 50 } else { req.limit.min(100) };
        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta del ranking"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;
        common::set_leaderboard_read_scope(&mut *tx).await
            .map_err(|_| Status::internal("No se pudo establecer el alcance del ranking"))?;

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
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo consultar el ranking"))?;
        tx.commit().await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta del ranking"))?;

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
        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta de logros"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

        // 1. Get user_stats
        let stats_row: Option<(i32, i32, i32)> = sqlx::query_as(
            "SELECT xp, streak_days, words_learned FROM user_stats WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (xp, streak_days, words_learned) = stats_row.unwrap_or((0, 0, 0));

        // 2. Get ai_exam_sessions stats
        let exam_row: Option<(i64, f64, f64)> = sqlx::query_as(
            "SELECT COUNT(*), COALESCE(MAX(total_score), 0.0), COALESCE(MAX(score_pronunciation), 0.0) FROM ai_exam_sessions WHERE user_id = $1"
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (total_exams, max_score, max_pronunciation) = exam_row.unwrap_or((0, 0.0, 0.0));

        // 3. Get srs progress count
        let srs_row: Option<(i64,)> = sqlx::query_as(
            "SELECT COUNT(*) FROM user_srs_progress WHERE user_id = $1 AND repetitions > 0"
        )
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let srs_cards = srs_row.unwrap_or((0,)).0 as i32;

        // Consultar logros dinámicamente desde la tabla `achievements` de PostgreSQL
        let db_achievements: Vec<(String, String, String, String, i32, String)> = sqlx::query_as(
            "SELECT id, emoji, title, description, max_progress, category FROM achievements ORDER BY id"
        )
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudieron consultar los logros"))?;

        tx.commit().await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta de logros"))?;

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


#[cfg(test)]
mod learning_progress_idempotency_tests {
    use super::MyGamificationService;
    use common::JwtClaims;
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use proto::gamification::gamification_service_server::GamificationService;
    use proto::gamification::RecordLearningProgressRequest;
    use sqlx::postgres::PgPoolOptions;
    use std::{env, sync::Arc, time::{SystemTime, UNIX_EPOCH}};
    use tonic::{Code, Request};
    use uuid::Uuid;

    const TEST_JWT_SECRET: &str = "learning-progress-idempotency-test-secret-0123456789abcdef";

    fn signed_token(user_id: Uuid, email: &str) -> Result<String, Box<dyn std::error::Error>> {
        let exp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs() as usize + 3600;
        let claims = JwtClaims {
            sub: user_id.to_string(),
            email: email.to_string(),
            role: "student".to_string(),
            exp,
        };
        Ok(encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(TEST_JWT_SECRET.as_bytes()),
        )?)
    }

    fn progress_request(
        user_id: Uuid,
        word_id: Uuid,
        token: &str,
        xp_amount: i32,
        coins_amount: i32,
        words_learned_delta: i32,
    ) -> Result<Request<RecordLearningProgressRequest>, Box<dyn std::error::Error>> {
        let mut request = Request::new(RecordLearningProgressRequest {
            user_id: user_id.to_string(),
            xp_amount,
            coins_amount,
            words_learned_delta,
            word_id: word_id.to_string(),
        });
        request.metadata_mut().insert(
            "authorization",
            tonic::metadata::MetadataValue::try_from(format!("Bearer {token}"))?,
        );
        Ok(request)
    }

    #[tokio::test]
    async fn rewards_are_idempotent_under_retries_and_concurrent_requests() -> Result<(), Box<dyn std::error::Error>> {
        let Ok(database_url) = env::var("TEST_DATABASE_URL") else {
            eprintln!("TEST_DATABASE_URL is not configured; skipping learning-progress integration test");
            return Ok(());
        };

        let prior_secret = env::var("JWT_SECRET").ok();
        env::set_var("JWT_SECRET", TEST_JWT_SECRET);

        let result = async {
            let pool = PgPoolOptions::new()
                .max_connections(6)
                .connect(&database_url)
                .await?;

            // CI applies all migrations before tests. Check the actual schema and
            // fail rather than silently testing without the idempotency ledger.
            let ledger_ready: bool = sqlx::query_scalar(
                "SELECT to_regclass('public.learning_progress_events') IS NOT NULL"
            )
            .fetch_one(&pool)
            .await?;
            assert!(ledger_ready, "apply migrations before running this integration test");

            let user_id = Uuid::new_v4();
            let first_word = Uuid::new_v4();
            let second_word = Uuid::new_v4();
            let email = format!("idempotency-{}@example.invalid", user_id);

            sqlx::query(
                "INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, 'not-a-login-hash', 'Idempotency Integration')"
            )
            .bind(user_id)
            .bind(&email)
            .execute(&pool)
            .await?;

            for (word_id, word) in [(first_word, "idempotency-first"), (second_word, "idempotency-second")] {
                sqlx::query(
                    "INSERT INTO vocabulary_words (id, word, spanish_phonetic, spanish_translation, category, level) VALUES ($1, $2, 'phonetic', 'translation', 'test', 'A1')"
                )
                .bind(word_id)
                .bind(word)
                .execute(&pool)
                .await?;
            }

            sqlx::query(
                "INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered, last_study_date) VALUES ($1, 0, 0, 50, 0, 0, CURRENT_DATE - INTERVAL '2 days')"
            )
            .bind(user_id)
            .execute(&pool)
            .await?;

            let token = signed_token(user_id, &email)?;
            let service = MyGamificationService::new(Arc::new(pool.clone()));

            let first = service.record_learning_progress(progress_request(
                user_id, first_word, &token, 10, 2, 1
            )?).await?.into_inner();
            assert!(first.applied);
            assert_eq!(first.xp_gained, 10);
            assert_eq!(first.coins_gained, 2);
            let first_stats = first.stats.expect("new progress event returns stats");
            assert_eq!(first_stats.xp, 10);
            assert_eq!(first_stats.coins, 52);
            assert_eq!(first_stats.words_learned, 1);

            let replay = service.record_learning_progress(progress_request(
                user_id, first_word, &token, 10, 2, 1
            )?).await?.into_inner();
            assert!(!replay.applied);
            assert_eq!(replay.xp_gained, 0);
            assert_eq!(replay.coins_gained, 0);
            let replay_stats = replay.stats.expect("replayed progress event returns current stats");
            assert_eq!(replay_stats.xp, 10);
            assert_eq!(replay_stats.coins, 52);
            assert_eq!(replay_stats.words_learned, 1);

            let invalid_reward = service.record_learning_progress(progress_request(
                user_id, second_word, &token, 5000, 2, 1
            )?).await.unwrap_err();
            assert_eq!(invalid_reward.code(), Code::InvalidArgument);

            let unknown_word = service.record_learning_progress(progress_request(
                user_id, Uuid::new_v4(), &token, 10, 2, 1
            )?).await.unwrap_err();
            assert_eq!(unknown_word.code(), Code::NotFound);

            let (concurrent_a, concurrent_b) = tokio::join!(
                service.record_learning_progress(progress_request(
                    user_id, second_word, &token, 10, 2, 1
                ).expect("construct concurrent request A")),
                service.record_learning_progress(progress_request(
                    user_id, second_word, &token, 10, 2, 1
                ).expect("construct concurrent request B")),
            );
            let a = concurrent_a?.into_inner();
            let b = concurrent_b?.into_inner();
            assert_ne!(a.applied, b.applied, "exactly one concurrent request must apply rewards");

            let totals: (i32, i32, i32) = sqlx::query_as(
                "SELECT xp, coins, words_learned FROM user_stats WHERE user_id = $1"
            )
            .bind(user_id)
            .fetch_one(&pool)
            .await?;
            assert_eq!(totals, (20, 54, 2));

            // The idempotency key is (user_id, word_id), not word_id alone:
            // another user can earn the reward for the same shared vocabulary word.
            let user_b = Uuid::new_v4();
            let email_b = format!("idempotency-{}@example.invalid", user_b);
            sqlx::query(
                "INSERT INTO users (id, email, password_hash, full_name) VALUES ($1, $2, 'not-a-login-hash', 'Second Idempotency User')"
            )
            .bind(user_b)
            .bind(&email_b)
            .execute(&pool)
            .await?;
            sqlx::query(
                "INSERT INTO user_stats (user_id, xp, streak_days, coins, words_learned, sentences_mastered, last_study_date) VALUES ($1, 0, 0, 50, 0, 0, CURRENT_DATE - INTERVAL '2 days')"
            )
            .bind(user_b)
            .execute(&pool)
            .await?;

            let token_b = signed_token(user_b, &email_b)?;
            let other_user_award = service.record_learning_progress(progress_request(
                user_b, first_word, &token_b, 10, 2, 1
            )?).await?.into_inner();
            assert!(other_user_award.applied);
            assert_eq!(other_user_award.stats.expect("user B stats").xp, 10);

            let event_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM learning_progress_events WHERE user_id = $1"
            )
            .bind(user_id)
            .fetch_one(&pool)
            .await?;
            assert_eq!(event_count, 2);
            let user_b_event_count: i64 = sqlx::query_scalar(
                "SELECT COUNT(*) FROM learning_progress_events WHERE user_id = $1"
            )
            .bind(user_b)
            .fetch_one(&pool)
            .await?;
            assert_eq!(user_b_event_count, 1);

            sqlx::query("DELETE FROM users WHERE id = $1 OR id = $2")
                .bind(user_id)
                .bind(user_b)
                .execute(&pool)
                .await?;
            sqlx::query("DELETE FROM vocabulary_words WHERE id = $1 OR id = $2")
                .bind(first_word)
                .bind(second_word)
                .execute(&pool)
                .await?;
            pool.close().await;

            Ok::<(), Box<dyn std::error::Error>>(())
        }.await;

        if let Some(secret) = prior_secret {
            env::set_var("JWT_SECRET", secret);
        } else {
            env::remove_var("JWT_SECRET");
        }
        result
    }
}
