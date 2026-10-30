use proto::content::content_service_server::ContentService;
use proto::content::{
    ContextSentence, GetRandomInterviewQuestionRequest, GetVocabularyWordRequest,
    InterviewQuestionResponse, ListVocabularyWordsRequest, ListVocabularyWordsResponse,
    VocabularyWordResponse,
};
use sqlx::PgPool;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

pub struct MyContentService {
    pub pool: Arc<PgPool>,
}

impl MyContentService {
    pub fn new(pool: Arc<PgPool>) -> Self {
        Self { pool }
    }
}

#[tonic::async_trait]
impl ContentService for MyContentService {
    async fn get_vocabulary_word(
        &self,
        request: Request<GetVocabularyWordRequest>,
    ) -> Result<Response<VocabularyWordResponse>, Status> {
        let req = request.into_inner();
        let word_id = Uuid::parse_str(&req.word_id)
            .map_err(|_| Status::invalid_argument("word_id inválido"))?;

        let word: Option<(Uuid, String, String, String, String, String, String)> = sqlx::query_as(
            "SELECT id, word, spanish_phonetic, spanish_translation, category, level, COALESCE(spanish_phonetic_natural, spanish_phonetic) FROM vocabulary_words WHERE id = $1"
        )
        .bind(word_id)
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (id, word, phonetic, translation, category, level, phonetic_nat) =
            word.ok_or_else(|| Status::not_found("Palabra no encontrada"))?;

        let sentences: Vec<(Uuid, String, String, String, Option<String>, String)> = sqlx::query_as(
            "SELECT id, english_text, spanish_phonetic, spanish_translation, audio_url, COALESCE(spanish_phonetic_natural, spanish_phonetic) FROM context_sentences WHERE word_id = $1"
        )
        .bind(id)
        .fetch_all(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let context_sentences = sentences
            .into_iter()
            .map(|(sid, en, ph, es, audio, ph_nat)| ContextSentence {
                id: sid.to_string(),
                english_text: en,
                spanish_phonetic: ph,
                spanish_translation: es,
                audio_url: audio.unwrap_or_default(),
                spanish_phonetic_natural: ph_nat,
            })
            .collect();

        Ok(Response::new(VocabularyWordResponse {
            id: id.to_string(),
            word,
            spanish_phonetic: phonetic,
            spanish_translation: translation,
            category,
            level,
            context_sentences,
            spanish_phonetic_natural: phonetic_nat,
        }))
    }

    async fn list_vocabulary_words(
        &self,
        request: Request<ListVocabularyWordsRequest>,
    ) -> Result<Response<ListVocabularyWordsResponse>, Status> {
        if !request.get_ref().user_id.is_empty() {
            common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        }
        let req = request.into_inner();
        let limit = if req.limit <= 0 { 20 } else { req.limit };
        let offset = if req.offset < 0 { 0 } else { req.offset };

        let user_uuid = Uuid::parse_str(&req.user_id).ok();

        // Todas las consultas que usan el progreso del usuario comparten una
        // transacción y su contexto RLS. Para una petición pública, no se define
        // identidad, por lo que solo se consultan tablas de contenido público.
        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta de vocabulario"))?;
        if let Some(uid) = user_uuid {
            common::set_current_user_id(&mut tx, uid)
                .await
                .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;
        }

        // Construir query con filtros opcionales y exclusión de palabras ya aprendidas
        let words: Vec<(Uuid, String, String, String, String, String, String)> = match (
            !req.level.is_empty(),
            !req.category.is_empty(),
            user_uuid,
        ) {
            (true, true, Some(uid)) => {
                sqlx::query_as(
                    r#"SELECT id, word, spanish_phonetic, spanish_translation, category, level, COALESCE(spanish_phonetic_natural, spanish_phonetic) 
                       FROM vocabulary_words 
                       WHERE level = $1 AND category = $2 
                         AND id NOT IN (SELECT s.word_id FROM context_sentences s JOIN user_srs_progress p ON s.id = p.sentence_id WHERE p.user_id = $3)
                       LIMIT $4 OFFSET $5"#,
                )
                .bind(&req.level).bind(&req.category).bind(uid).bind(limit as i64).bind(offset as i64)
                .fetch_all(&mut *tx).await
            }
            (true, false, Some(uid)) => {
                sqlx::query_as(
                    r#"SELECT id, word, spanish_phonetic, spanish_translation, category, level, COALESCE(spanish_phonetic_natural, spanish_phonetic) 
                       FROM vocabulary_words 
                       WHERE id NOT IN (SELECT s.word_id FROM context_sentences s JOIN user_srs_progress p ON s.id = p.sentence_id WHERE p.user_id = $2)
                         AND CASE level 
                             WHEN 'A0' THEN 1 
                             WHEN 'A1' THEN 2 
                             WHEN 'A2' THEN 3 
                             WHEN 'B1' THEN 4 
                             WHEN 'B2' THEN 5 
                             WHEN 'C1' THEN 6 
                             ELSE 7 
                         END >= CASE $1 
                             WHEN 'A0' THEN 1 
                             WHEN 'A1' THEN 2 
                             WHEN 'A2' THEN 3 
                             WHEN 'B1' THEN 4 
                             WHEN 'B2' THEN 5 
                             WHEN 'C1' THEN 6 
                             ELSE 1 
                         END
                       ORDER BY CASE level 
                           WHEN 'A0' THEN 1 
                           WHEN 'A1' THEN 2 
                           WHEN 'A2' THEN 3 
                           WHEN 'B1' THEN 4 
                           WHEN 'B2' THEN 5 
                           WHEN 'C1' THEN 6 
                           ELSE 7 
                       END ASC
                       LIMIT $3 OFFSET $4"#,
                )
                .bind(&req.level).bind(uid).bind(limit as i64).bind(offset as i64)
                .fetch_all(&mut *tx).await
            }
            (false, false, Some(uid)) => {
                sqlx::query_as(
                    r#"SELECT id, word, spanish_phonetic, spanish_translation, category, level, COALESCE(spanish_phonetic_natural, spanish_phonetic) 
                       FROM vocabulary_words 
                       WHERE id NOT IN (SELECT s.word_id FROM context_sentences s JOIN user_srs_progress p ON s.id = p.sentence_id WHERE p.user_id = $1)
                       ORDER BY CASE level 
                           WHEN 'A0' THEN 1 
                           WHEN 'A1' THEN 2 
                           WHEN 'A2' THEN 3 
                           WHEN 'B1' THEN 4 
                           WHEN 'B2' THEN 5 
                           WHEN 'C1' THEN 6 
                           ELSE 7 
                       END ASC
                       LIMIT $2 OFFSET $3"#,
                )
                .bind(uid).bind(limit as i64).bind(offset as i64)
                .fetch_all(&mut *tx).await
            }
            (true, true, None) => {
                sqlx::query_as(
                    "SELECT id, word, spanish_phonetic, spanish_translation, category, level, COALESCE(spanish_phonetic_natural, spanish_phonetic) FROM vocabulary_words WHERE level = $1 AND category = $2 LIMIT $3 OFFSET $4"
                )
                .bind(&req.level).bind(&req.category).bind(limit as i64).bind(offset as i64)
                .fetch_all(&mut *tx).await
            }
            (true, false, None) => {
                sqlx::query_as(
                    "SELECT id, word, spanish_phonetic, spanish_translation, category, level, COALESCE(spanish_phonetic_natural, spanish_phonetic) FROM vocabulary_words WHERE level = $1 LIMIT $2 OFFSET $3"
                )
                .bind(&req.level).bind(limit as i64).bind(offset as i64)
                .fetch_all(&mut *tx).await
            }
            _ => {
                sqlx::query_as(
                    "SELECT id, word, spanish_phonetic, spanish_translation, category, level, COALESCE(spanish_phonetic_natural, spanish_phonetic) FROM vocabulary_words LIMIT $1 OFFSET $2"
                )
                .bind(limit as i64).bind(offset as i64)
                .fetch_all(&mut *tx).await
            }
        }
        .map_err(|e| Status::internal(e.to_string()))?;

        let total = words.len() as i32;

        // Para cada palabra traer sus frases
        let mut result_words = Vec::new();
        for (id, word, phonetic, translation, category, level, phonetic_nat) in words {
            let sentences: Vec<(Uuid, String, String, String, Option<String>, String)> = sqlx::query_as(
                "SELECT id, english_text, spanish_phonetic, spanish_translation, audio_url, COALESCE(spanish_phonetic_natural, spanish_phonetic) FROM context_sentences WHERE word_id = $1"
            )
            .bind(id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudieron consultar las frases de vocabulario"))?;

            let context_sentences = sentences
                .into_iter()
                .map(|(sid, en, ph, es, audio, ph_nat)| ContextSentence {
                    id: sid.to_string(),
                    english_text: en,
                    spanish_phonetic: ph,
                    spanish_translation: es,
                    audio_url: audio.unwrap_or_default(),
                    spanish_phonetic_natural: ph_nat,
                })
                .collect();

            result_words.push(VocabularyWordResponse {
                id: id.to_string(),
                word,
                spanish_phonetic: phonetic,
                spanish_translation: translation,
                category,
                level,
                context_sentences,
                spanish_phonetic_natural: phonetic_nat,
            });
        }

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta de vocabulario"))?;

        Ok(Response::new(ListVocabularyWordsResponse {
            words: result_words,
            total,
        }))
    }

    async fn get_random_interview_question(
        &self,
        _request: Request<GetRandomInterviewQuestionRequest>,
    ) -> Result<Response<InterviewQuestionResponse>, Status> {
        let row: Option<(Uuid, String, String, String)> = sqlx::query_as(
            "SELECT id, question, category, difficulty FROM interview_questions ORDER BY RANDOM() LIMIT 1"
        )
        .fetch_optional(self.pool.as_ref())
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let (id, question, category, difficulty) = row.ok_or_else(|| {
            Status::not_found("No hay preguntas de entrevista disponibles en la BD")
        })?;

        Ok(Response::new(InterviewQuestionResponse {
            id: id.to_string(),
            question,
            category,
            difficulty,
        }))
    }
}
