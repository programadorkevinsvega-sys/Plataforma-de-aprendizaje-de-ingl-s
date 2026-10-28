use crate::domain::AnkiSm2Engine;
use chrono::Utc;
use proto::srs::srs_service_server::SrsService;
use proto::srs::{
    AddCardsToDeckRequest, AddCardsToDeckResponse, GetDueCardsRequest, GetDueCardsResponse,
    ReviewCardRequest, ReviewCardResponse, SrsCard,
};
use sqlx::PgPool;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

pub struct MySrsService {
    pub pool: Arc<PgPool>,
}

impl MySrsService {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[tonic::async_trait]
impl SrsService for MySrsService {
    async fn get_due_cards(
        &self,
        request: Request<GetDueCardsRequest>,
    ) -> Result<Response<GetDueCardsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let limit = if req.limit <= 0 { 20 } else { req.limit };
        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta de repaso"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto de usuario RLS"))?;

        let rows: Vec<(Uuid, Uuid, f32, i32, i32, String, String, String, String)> =
            sqlx::query_as(
                r#"
                SELECT p.id, p.sentence_id, p.easiness_factor::float4, p.interval_days, p.repetitions,
                       s.english_text, s.spanish_phonetic, s.spanish_translation,
                       p.next_review::text
                FROM user_srs_progress p
                JOIN context_sentences s ON s.id = p.sentence_id
                WHERE p.user_id = $1 AND p.next_review <= NOW()
                ORDER BY p.next_review ASC
                LIMIT $2
                "#,
            )
            .bind(user_id)
            .bind(limit as i64)
            .fetch_all(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudieron consultar las tarjetas"))?;
        tx.commit().await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta de repaso"))?;

        let cards: Vec<SrsCard> = rows
            .into_iter()
            .map(
                |(id, sentence_id, ef, interval, reps, en, ph, es, next_review)| SrsCard {
                    id: id.to_string(),
                    sentence_id: sentence_id.to_string(),
                    english_text: en,
                    spanish_phonetic: ph,
                    spanish_translation: es,
                    easiness_factor: ef,
                    interval_days: interval,
                    repetitions: reps,
                    next_review,
                },
            )
            .collect();

        let total = cards.len() as i32;
        Ok(Response::new(GetDueCardsResponse { cards, total }))
    }

    async fn review_card(
        &self,
        request: Request<ReviewCardRequest>,
    ) -> Result<Response<ReviewCardResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let card_id = Uuid::parse_str(&req.card_id)
            .map_err(|_| Status::invalid_argument("card_id inválido"))?;

        // El contexto RLS y la lectura/escritura de esta tarjeta comparten transacción.
        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar la revisión"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto de usuario RLS"))?;

        // Buscar estado actual de la tarjeta
        let row: Option<(f32, i32, i32)> = sqlx::query_as(
            "SELECT easiness_factor::float4, interval_days, repetitions FROM user_srs_progress WHERE id = $1 AND user_id = $2"
        )
        .bind(card_id)
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (ef, interval, reps) =
            row.ok_or_else(|| Status::not_found("Tarjeta no encontrada"))?;

        // Aplicar algoritmo SM-2
        use crate::domain::SrsItem;
        let current = SrsItem {
            easiness_factor: ef,
            interval_days: interval,
            repetitions: reps,
            next_review: Utc::now(),
        };
        let grade = (req.grade.clamp(0, 5)) as u8;
        let updated = AnkiSm2Engine::calculate_next_review(&current, grade);
        let next_review = Utc::now() + chrono::Duration::days(updated.interval_days as i64);

        // Actualizar en PostgreSQL
        sqlx::query(
            "UPDATE user_srs_progress SET easiness_factor = $1, interval_days = $2, repetitions = $3, next_review = $4 WHERE id = $5 AND user_id = $6"
        )
        .bind(updated.easiness_factor as f64)
        .bind(updated.interval_days)
        .bind(updated.repetitions)
        .bind(next_review)
        .bind(card_id)
        .bind(user_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo actualizar la tarjeta"))?;

        tx.commit().await
            .map_err(|_| Status::internal("No se pudo confirmar la revisión"))?;

        Ok(Response::new(ReviewCardResponse {
            card_id: card_id.to_string(),
            new_interval_days: updated.interval_days,
            new_easiness_factor: updated.easiness_factor,
            next_review_at: next_review.to_rfc3339(),
        }))
    }

    async fn add_cards_to_deck(
        &self,
        request: Request<AddCardsToDeckRequest>,
    ) -> Result<Response<AddCardsToDeckResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let word_id = Uuid::parse_str(&req.word_id)
            .map_err(|_| Status::invalid_argument("word_id inválido"))?;

        let mut tx = self.pool.begin().await
            .map_err(|_| Status::internal("No se pudo iniciar el alta de tarjetas"))?;
        common::set_current_user_id(&mut *tx, user_id).await
            .map_err(|_| Status::internal("No se pudo establecer el contexto de usuario RLS"))?;

        // Insertar todas las oraciones asociadas a esa palabra en la tabla de repaso (si no existen ya)
        // Programamos el primer repaso para mañana (NOW() + 1 day) con valores base SM-2
        let res = sqlx::query(
            r#"
            INSERT INTO user_srs_progress (user_id, sentence_id, easiness_factor, interval_days, repetitions, next_review)
            SELECT $1, id, 2.5, 1, 0, CURRENT_DATE + INTERVAL '1 day'
            FROM context_sentences
            WHERE word_id = $2
            ON CONFLICT (user_id, sentence_id) DO NOTHING
            "#,
        )
        .bind(user_id)
        .bind(word_id)
        .execute(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudieron añadir las tarjetas"))?;
        let cards_added = res.rows_affected() as i32;

        tx.commit().await
            .map_err(|_| Status::internal("No se pudo confirmar el alta de tarjetas"))?;

        Ok(Response::new(AddCardsToDeckResponse { cards_added }))
    }
}
