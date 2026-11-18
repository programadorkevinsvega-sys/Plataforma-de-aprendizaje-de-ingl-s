use crate::curriculum_package::{import_package, validate_package_json};
use proto::content::content_service_server::ContentService;
use proto::content::{
    ContextSentence, CurriculumCourseSummary, CurriculumLesson, CurriculumLessonProgress,
    CurriculumObjective, EditorialCourseVersionSummary, ListEditorialVersionsRequest,
    ListEditorialVersionsResponse, ManageEditorialVersionRequest,
    ManageEditorialVersionResponse, ImportCurriculumPackageRequest,
    ImportCurriculumPackageResponse, CurriculumPrerequisite, CurriculumUnit,
    EnrollInCourseRequest, EnrollInCourseResponse,
    GetCurriculumCourseRequest, GetCurriculumCourseResponse, GetRandomInterviewQuestionRequest,
    GetVocabularyWordRequest, InterviewQuestionResponse, ListCurriculumCoursesRequest,
    ListCurriculumCoursesResponse, ListVocabularyWordsRequest, ListVocabularyWordsResponse,
    VocabularyWordResponse,
};
use sqlx::PgPool;
use std::collections::HashMap;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;

struct ValidatedStudentCatalogQuery {
    page: i32,
    page_size: i32,
    track: Option<String>,
    level: Option<String>,
    search: Option<String>,
}

fn validate_student_catalog_query(
    request: &ListCurriculumCoursesRequest,
) -> Result<ValidatedStudentCatalogQuery, Status> {
    let page = if request.page <= 0 { 1 } else { request.page };
    let page_size = if request.page_size <= 0 {
        12
    } else if request.page_size > 50 {
        return Err(Status::invalid_argument("page_size no puede superar 50"));
    } else {
        request.page_size
    };
    if !request.track_code.is_empty()
        && !matches!(request.track_code.as_str(), "general" | "technology")
    {
        return Err(Status::invalid_argument("track_code no es válido"));
    }
    if !request.cefr_level.is_empty()
        && !matches!(
            request.cefr_level.as_str(),
            "PRE_A1" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
        )
    {
        return Err(Status::invalid_argument("cefr_level no es válido"));
    }
    let search = request.search_query.trim().to_lowercase();
    if search.len() > 120 {
        return Err(Status::invalid_argument(
            "search_query no puede superar 120 caracteres",
        ));
    }

    Ok(ValidatedStudentCatalogQuery {
        page,
        page_size,
        track: (!request.track_code.is_empty()).then(|| request.track_code.clone()),
        level: (!request.cefr_level.is_empty()).then(|| request.cefr_level.clone()),
        search: (!search.is_empty()).then_some(search),
    })
}

type LessonProgressEvidence = (i32, i32, f64, bool, bool);

fn evaluate_lesson_progress(
    enrolled: bool,
    evidence: LessonProgressEvidence,
    prerequisites: &[CurriculumPrerequisite],
    lesson_evidence: &HashMap<Uuid, LessonProgressEvidence>,
) -> CurriculumLessonProgress {
    let (required, completed, mastery_score, is_completed, is_mastered) = evidence;
    let prerequisites_satisfied = enrolled
        && prerequisites.iter().all(|prerequisite| {
            let prerequisite_id = Uuid::parse_str(&prerequisite.prerequisite_lesson_id).ok();
            let Some((_, _, prerequisite_mastery, prerequisite_completed, _)) =
                prerequisite_id.and_then(|id| lesson_evidence.get(&id).copied())
            else {
                return false;
            };
            if prerequisite.required_state == "mastered" {
                prerequisite_completed
                    && prerequisite_mastery >= prerequisite.minimum_mastery_score
            } else {
                prerequisite_completed
            }
        });

    let state = if !enrolled {
        "not_enrolled"
    } else if is_mastered {
        "mastered"
    } else if is_completed {
        "completed"
    } else if !prerequisites_satisfied {
        "locked"
    } else if completed > 0 {
        "in_progress"
    } else {
        "available"
    };

    CurriculumLessonProgress {
        state: state.to_string(),
        mastery_score: mastery_score.clamp(0.0, 1.0),
        required_objectives: required,
        completed_objectives: completed,
        prerequisites_satisfied,
    }
}

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

    async fn list_curriculum_courses(
        &self,
        request: Request<ListCurriculumCoursesRequest>,
    ) -> Result<Response<ListCurriculumCoursesResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let filters = validate_student_catalog_query(&req)?;
        let page = filters.page;
        let page_size = filters.page_size;
        let track = filters.track;
        let level = filters.level;
        let search = filters.search;

        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta curricular"))?;
        common::set_current_user_id(&mut tx, user_id)
            .await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

        let visible_filter = r#"(
            version.status = 'published'
            OR EXISTS (
                SELECT 1 FROM course_enrollments enrollment
                 WHERE enrollment.course_version_id = version.id
                   AND enrollment.user_id = $1
            )
        )"#;
        let total: i64 = sqlx::query_scalar(&format!(
            r#"SELECT COUNT(*)
                 FROM courses course
                 JOIN course_versions version ON version.course_id = course.id
                WHERE {visible_filter}
                  AND ($2::TEXT IS NULL OR course.track_code = $2)
                  AND ($3::TEXT IS NULL OR version.cefr_level = $3)
                  AND ($4::TEXT IS NULL OR (
                      course.slug ILIKE '%' || $4 || '%'
                      OR version.title ILIKE '%' || $4 || '%'
                      OR version.description ILIKE '%' || $4 || '%'
                  ))
                  AND (NOT $5 OR EXISTS (
                      SELECT 1 FROM course_enrollments enrollment
                       WHERE enrollment.course_version_id = version.id
                         AND enrollment.user_id = $1
                  ))"#
        ))
        .bind(user_id)
        .bind(track.as_deref())
        .bind(level.as_deref())
        .bind(search.as_deref())
        .bind(req.enrolled_only)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo contar el catálogo curricular"))?;

        let offset = i64::from(page - 1).saturating_mul(i64::from(page_size));
        let rows: Vec<(String, String, String, i32, String, String, String, i64, i64, i64, bool, String)> =
            sqlx::query_as(&format!(
                r#"SELECT
                       course.slug,
                       course.track_code,
                       version.id::text,
                       version.version_number,
                       version.cefr_level,
                       version.title,
                       version.description,
                       (SELECT COUNT(*) FROM course_units unit WHERE unit.course_version_id = version.id),
                       (SELECT COUNT(*) FROM course_lessons lesson WHERE lesson.course_version_id = version.id),
                       (SELECT COALESCE(SUM(lesson.estimated_minutes), 0)
                          FROM course_lessons lesson WHERE lesson.course_version_id = version.id),
                       EXISTS (
                           SELECT 1 FROM course_enrollments enrollment
                            WHERE enrollment.course_version_id = version.id
                              AND enrollment.user_id = $1
                       ),
                       version.status
                   FROM courses course
                   JOIN course_versions version ON version.course_id = course.id
                  WHERE {visible_filter}
                    AND ($2::TEXT IS NULL OR course.track_code = $2)
                    AND ($3::TEXT IS NULL OR version.cefr_level = $3)
                    AND ($4::TEXT IS NULL OR (
                        course.slug ILIKE '%' || $4 || '%'
                        OR version.title ILIKE '%' || $4 || '%'
                        OR version.description ILIKE '%' || $4 || '%'
                    ))
                    AND (NOT $5 OR EXISTS (
                        SELECT 1 FROM course_enrollments enrollment
                         WHERE enrollment.course_version_id = version.id
                           AND enrollment.user_id = $1
                    ))
                  ORDER BY
                    CASE course.track_code WHEN 'general' THEN 1 ELSE 2 END,
                    CASE version.cefr_level
                      WHEN 'PRE_A1' THEN 1 WHEN 'A1' THEN 2 WHEN 'A2' THEN 3
                      WHEN 'B1' THEN 4 WHEN 'B2' THEN 5 WHEN 'C1' THEN 6 ELSE 7
                    END,
                    course.slug,
                    version.version_number DESC
                  LIMIT $6 OFFSET $7"#
            ))
            .bind(user_id)
            .bind(track.as_deref())
            .bind(level.as_deref())
            .bind(search.as_deref())
            .bind(req.enrolled_only)
            .bind(i64::from(page_size))
            .bind(offset)
            .fetch_all(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudo consultar el catálogo curricular"))?;

        let items = rows
            .into_iter()
            .map(
                |(
                    slug,
                    track,
                    version_id,
                    version_number,
                    level,
                    title,
                    description,
                    unit_count,
                    lesson_count,
                    minutes,
                    enrolled,
                    status,
                )| {
                    CurriculumCourseSummary {
                        course_version_id: version_id,
                        slug,
                        track_code: track,
                        cefr_level: level,
                        version_number,
                        title,
                        description,
                        unit_count: unit_count.min(i32::MAX as i64) as i32,
                        lesson_count: lesson_count.min(i32::MAX as i64) as i32,
                        estimated_minutes: minutes.min(i32::MAX as i64) as i32,
                        enrolled,
                        status,
                    }
                },
            )
            .collect();

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta curricular"))?;

        let total_pages = if total == 0 {
            0
        } else {
            ((total + i64::from(page_size) - 1) / i64::from(page_size))
                .min(i64::from(i32::MAX)) as i32
        };
        Ok(Response::new(ListCurriculumCoursesResponse {
            items,
            total: total.min(i64::from(i32::MAX)) as i32,
            page,
            page_size,
            total_pages,
        }))
    }

    async fn get_curriculum_course(
        &self,
        request: Request<GetCurriculumCourseRequest>,
    ) -> Result<Response<GetCurriculumCourseResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let course_version_id = Uuid::parse_str(&req.course_version_id)
            .map_err(|_| Status::invalid_argument("course_version_id inválido"))?;

        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta curricular"))?;
        common::set_current_user_id(&mut tx, user_id)
            .await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;
        let is_editor: bool = sqlx::query_scalar("SELECT app_is_content_editor()")
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudo verificar la capacidad editorial"))?;

        let course_row: Option<(
            Uuid,
            String,
            String,
            i32,
            String,
            String,
            String,
            String,
            bool,
        )> = sqlx::query_as(
            r#"SELECT
                       version.id,
                       course.slug,
                       course.track_code,
                       version.version_number,
                       version.cefr_level,
                       version.title,
                       version.description,
                       version.status,
                       EXISTS (
                           SELECT 1 FROM course_enrollments enrollment
                            WHERE enrollment.course_version_id = version.id
                              AND enrollment.user_id = $2
                       )
                   FROM courses course
                   JOIN course_versions version ON version.course_id = course.id
                  WHERE version.id = $1
                    AND (
                        version.status = 'published'
                        OR EXISTS (
                            SELECT 1 FROM course_enrollments enrollment
                             WHERE enrollment.course_version_id = version.id
                               AND enrollment.user_id = $2
                        )
                        OR $3
                    )
                  LIMIT 1"#,
        )
        .bind(course_version_id)
        .bind(user_id)
        .bind(is_editor)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo consultar la versión del curso"))?;

        let (version_id, slug, track, version_number, level, title, description, status, enrolled) =
            course_row.ok_or_else(|| {
                Status::not_found("No existe una versión curricular disponible para esta cuenta")
            })?;

        let unit_rows: Vec<(Uuid, i32, String, String, String, Option<i32>)> = sqlx::query_as(
            r#"SELECT id, position, title, theme, description, estimated_minutes
                 FROM course_units
                WHERE course_version_id = $1
                ORDER BY position, id"#,
        )
        .bind(version_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudieron consultar las unidades del curso"))?;

        let lesson_rows: Vec<(Uuid, Uuid, String, i32, String, String, String, Option<i32>)> =
            sqlx::query_as(
                r#"SELECT id, unit_id, lesson_code, position, lesson_pattern, title, description, estimated_minutes
                     FROM course_lessons
                    WHERE course_version_id = $1
                    ORDER BY unit_id, position, id"#,
            )
            .bind(version_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudieron consultar las lecciones del curso"))?;

        let objective_rows: Vec<(Uuid, Uuid, String, String, String, i32, bool, Vec<String>)> =
            sqlx::query_as(
                r#"SELECT
                       link.lesson_id,
                       objective.id,
                       objective.objective_code,
                       objective.description,
                       objective.success_criteria,
                       link.position,
                       link.is_required,
                       COALESCE(
                           ARRAY_AGG(skill.skill_code::TEXT ORDER BY skill.skill_code)
                               FILTER (WHERE skill.skill_code IS NOT NULL),
                           ARRAY[]::TEXT[]
                       )
                   FROM lesson_learning_objectives link
                   JOIN learning_objectives objective
                     ON objective.id = link.learning_objective_id
                    AND objective.course_version_id = link.course_version_id
                   LEFT JOIN learning_objective_skills skill
                     ON skill.learning_objective_id = objective.id
                    AND skill.course_version_id = objective.course_version_id
                  WHERE link.course_version_id = $1
                  GROUP BY link.lesson_id, objective.id, objective.objective_code,
                           objective.description, objective.success_criteria,
                           link.position, link.is_required
                  ORDER BY link.lesson_id, link.position"#,
            )
            .bind(version_id)
            .fetch_all(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudieron consultar los objetivos del curso"))?;

        let prerequisite_rows: Vec<(Uuid, Uuid, String, f64)> = sqlx::query_as(
            r#"SELECT lesson_id, prerequisite_lesson_id, required_state,
                      minimum_mastery_score::DOUBLE PRECISION
                 FROM lesson_prerequisites
                WHERE course_version_id = $1
                ORDER BY lesson_id, prerequisite_lesson_id"#,
        )
        .bind(version_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudieron consultar los requisitos previos"))?;

        // Progreso calculado a partir de evidencia real ya persistida:
        // - learning_progress_events registra palabras completadas por el usuario.
        // - user_srs_progress registra revisiones exitosas (SM-2 incrementa
        //   repetitions solo con calificaciones >= 3 y reinicia al fallar).
        // Los ejercicios gramaticales/productivos aún no tienen intentos propios;
        // por eso un objetivo sin referencias medibles no se marca completado
        // ni obtiene una puntuación de dominio ficticia.
        let objective_evidence_rows: Vec<(Uuid, i64, i64, f64)> = sqlx::query_as(
            r#"SELECT
                   objective.id,
                   (
                       SELECT COUNT(*)
                         FROM learning_objective_vocabulary reference
                        WHERE reference.learning_objective_id = objective.id
                   ) + (
                       SELECT COUNT(*)
                         FROM learning_objective_sentences reference
                        WHERE reference.learning_objective_id = objective.id
                   ) AS evidence_total,
                   (
                       SELECT COUNT(*)
                         FROM learning_objective_vocabulary reference
                         JOIN learning_progress_events event
                           ON event.word_id = reference.vocabulary_word_id
                          AND event.user_id = $2
                        WHERE reference.learning_objective_id = objective.id
                   ) + (
                       SELECT COUNT(*)
                         FROM learning_objective_sentences reference
                         JOIN user_srs_progress review
                           ON review.sentence_id = reference.context_sentence_id
                          AND review.user_id = $2
                          AND review.repetitions > 0
                        WHERE reference.learning_objective_id = objective.id
                   ) AS evidence_completed,
                   CASE
                     WHEN EXISTS (
                         SELECT 1 FROM learning_objective_sentences reference
                          WHERE reference.learning_objective_id = objective.id
                     )
                     THEN COALESCE((
                         SELECT AVG(LEAST(review.repetitions::DOUBLE PRECISION / 3.0, 1.0))
                           FROM learning_objective_sentences reference
                           LEFT JOIN user_srs_progress review
                             ON review.sentence_id = reference.context_sentence_id
                            AND review.user_id = $2
                          WHERE reference.learning_objective_id = objective.id
                     ), 0.0)
                     ELSE 0.0
                   END AS mastery_score
               FROM learning_objectives objective
              WHERE objective.course_version_id = $1"#,
        )
        .bind(version_id)
        .bind(user_id)
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo calcular la evidencia curricular del usuario"))?;

        let mut objectives_by_lesson: HashMap<Uuid, Vec<CurriculumObjective>> = HashMap::new();
        for (lesson_id, id, code, objective, criteria, position, required, skills) in &objective_rows
        {
            objectives_by_lesson
                .entry(*lesson_id)
                .or_default()
                .push(CurriculumObjective {
                    id: id.to_string(),
                    objective_code: code.clone(),
                    description: objective.clone(),
                    success_criteria: criteria.clone(),
                    position: *position,
                    required: *required,
                    skills: skills.clone(),
                });
        }

        let mut prerequisites_by_lesson: HashMap<Uuid, Vec<CurriculumPrerequisite>> =
            HashMap::new();
        for (lesson_id, prerequisite_id, required_state, minimum_mastery_score) in
            &prerequisite_rows
        {
            prerequisites_by_lesson
                .entry(*lesson_id)
                .or_default()
                .push(CurriculumPrerequisite {
                    prerequisite_lesson_id: prerequisite_id.to_string(),
                    required_state: required_state.clone(),
                    minimum_mastery_score: *minimum_mastery_score,
                });
        }

        let evidence_by_objective: HashMap<Uuid, (i64, i64, f64)> = objective_evidence_rows
            .into_iter()
            .map(|(objective_id, total, completed, mastery)| {
                (objective_id, (total, completed, mastery.clamp(0.0, 1.0)))
            })
            .collect();

        // (objetivos obligatorios, objetivos completados, suma de dominio)
        let mut lesson_evidence: HashMap<Uuid, (i32, i32, f64)> = HashMap::new();
        for (lesson_id, objective_id, _, _, _, _, required, _) in &objective_rows {
            if !*required {
                continue;
            }
            let (evidence_total, evidence_completed, mastery_score) =
                evidence_by_objective.get(objective_id).copied().unwrap_or((0, 0, 0.0));
            let entry = lesson_evidence.entry(*lesson_id).or_insert((0, 0, 0.0));
            entry.0 = entry.0.saturating_add(1);
            if evidence_total > 0 && evidence_completed == evidence_total {
                entry.1 = entry.1.saturating_add(1);
            }
            entry.2 += mastery_score;
        }

        // Primero se calcula la finalización/dominio base de todas las lecciones.
        // La disponibilidad se deriva después, evitando depender del orden visual
        // de las unidades cuando el grafo de prerrequisitos no es lineal.
        let mut lesson_base: HashMap<Uuid, (i32, i32, f64, bool, bool)> = HashMap::new();
        for (lesson_id, _, _, _, _, _, _, _) in &lesson_rows {
            let (required, completed, mastery_sum) =
                lesson_evidence.get(lesson_id).copied().unwrap_or((0, 0, 0.0));
            let mastery_score = if required > 0 {
                (mastery_sum / f64::from(required)).clamp(0.0, 1.0)
            } else {
                0.0
            };
            let is_completed = required > 0 && completed == required;
            let is_mastered = is_completed && mastery_score >= 0.8;
            lesson_base.insert(
                *lesson_id,
                (required, completed, mastery_score, is_completed, is_mastered),
            );
        }

        let mut progress_by_lesson: HashMap<Uuid, CurriculumLessonProgress> = HashMap::new();
        for (lesson_id, _, _, _, _, _, _, _) in &lesson_rows {
            let evidence = lesson_base
                .get(lesson_id)
                .copied()
                .unwrap_or((0, 0, 0.0, false, false));
            let prerequisites = prerequisites_by_lesson
                .get(lesson_id)
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            progress_by_lesson.insert(
                *lesson_id,
                evaluate_lesson_progress(enrolled, evidence, prerequisites, &lesson_base),
            );
        }

        let mut lessons_by_unit: HashMap<Uuid, Vec<CurriculumLesson>> = HashMap::new();
        for (id, unit_id, code, position, pattern, lesson_title, lesson_description, minutes) in
            &lesson_rows
        {
            lessons_by_unit
                .entry(*unit_id)
                .or_default()
                .push(CurriculumLesson {
                    id: id.to_string(),
                    lesson_code: code.clone(),
                    position: *position,
                    lesson_pattern: pattern.clone(),
                    title: lesson_title.clone(),
                    description: lesson_description.clone(),
                    estimated_minutes: minutes.unwrap_or_default(),
                    objectives: objectives_by_lesson.remove(id).unwrap_or_default(),
                    prerequisites: prerequisites_by_lesson.remove(id).unwrap_or_default(),
                    progress: progress_by_lesson.remove(id),
                });
        }

        let mut units = Vec::with_capacity(unit_rows.len());
        let mut lesson_count = 0_i32;
        let mut estimated_minutes = 0_i32;
        for (id, position, unit_title, theme, unit_description, minutes) in unit_rows {
            let lessons = lessons_by_unit.remove(&id).unwrap_or_default();
            lesson_count = lesson_count.saturating_add(lessons.len().min(i32::MAX as usize) as i32);
            estimated_minutes =
                estimated_minutes.saturating_add(lessons.iter().fold(0_i32, |total, lesson| {
                    total.saturating_add(lesson.estimated_minutes)
                }));
            units.push(CurriculumUnit {
                id: id.to_string(),
                position,
                title: unit_title,
                theme,
                description: unit_description,
                estimated_minutes: minutes.unwrap_or_default(),
                lessons,
            });
        }

        let course = CurriculumCourseSummary {
            course_version_id: version_id.to_string(),
            slug,
            track_code: track,
            cefr_level: level,
            version_number,
            title,
            description,
            unit_count: units.len().min(i32::MAX as usize) as i32,
            lesson_count,
            estimated_minutes,
            enrolled,
            status,
        };

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta curricular"))?;

        Ok(Response::new(GetCurriculumCourseResponse {
            course: Some(course),
            units,
        }))
    }

    async fn enroll_in_course(
        &self,
        request: Request<EnrollInCourseRequest>,
    ) -> Result<Response<EnrollInCourseResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let course_version_id = Uuid::parse_str(&request.get_ref().course_version_id)
            .map_err(|_| Status::invalid_argument("course_version_id inválido"))?;

        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la matrícula"))?;
        common::set_current_user_id(&mut tx, user_id)
            .await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

        let enrollment: Option<(Uuid, Uuid, String, String)> = sqlx::query_as(
            r#"INSERT INTO course_enrollments (user_id, course_version_id)
               SELECT $1, version.id
                 FROM course_versions version
                WHERE version.id = $2
                  AND version.status = 'published'
               ON CONFLICT (user_id, course_version_id)
               DO UPDATE SET last_accessed_at = CURRENT_TIMESTAMP
               RETURNING id, course_version_id, status, started_at::TEXT"#,
        )
        .bind(user_id)
        .bind(course_version_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo crear la matrícula del curso"))?;

        let (enrollment_id, version_id, status, started_at) = enrollment.ok_or_else(|| {
            Status::not_found("El curso no está publicado o ya no admite matrículas")
        })?;

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo confirmar la matrícula"))?;

        Ok(Response::new(EnrollInCourseResponse {
            enrollment_id: enrollment_id.to_string(),
            course_version_id: version_id.to_string(),
            status,
            started_at,
        }))
    }

    async fn list_editorial_versions(
        &self,
        request: Request<ListEditorialVersionsRequest>,
    ) -> Result<Response<ListEditorialVersionsResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let page = if req.page <= 0 { 1 } else { req.page };
        let page_size = if req.page_size <= 0 {
            20
        } else if req.page_size > 100 {
            return Err(Status::invalid_argument("page_size no puede superar 100"));
        } else {
            req.page_size
        };
        if !req.status.is_empty()
            && !matches!(req.status.as_str(), "draft" | "review" | "published" | "archived")
        {
            return Err(Status::invalid_argument("El filtro de estado editorial no es válido"));
        }
        let search = req.search_query.trim().to_lowercase();
        if search.len() > 120 {
            return Err(Status::invalid_argument("search_query no puede superar 120 caracteres"));
        }
        let status = if req.status.is_empty() { None } else { Some(req.status) };
        let search = if search.is_empty() { None } else { Some(search) };

        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta editorial"))?;
        common::set_current_user_id(&mut tx, user_id)
            .await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;
        let is_editor: bool = sqlx::query_scalar("SELECT app_is_content_editor()")
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudo verificar la capacidad editorial"))?;
        if !is_editor {
            return Err(Status::permission_denied(
                "La cuenta no está registrada como editora de contenidos curriculares",
            ));
        }

        let total: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*)
                 FROM courses course
                 JOIN course_versions version ON version.course_id = course.id
                WHERE ($1::TEXT IS NULL OR version.status = $1)
                  AND ($2::TEXT IS NULL OR (
                      course.slug ILIKE '%' || $2 || '%'
                      OR version.title ILIKE '%' || $2 || '%'
                      OR version.description ILIKE '%' || $2 || '%'
                  ))"#,
        )
        .bind(status.as_deref())
        .bind(search.as_deref())
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo contar la cola editorial"))?;

        let offset = i64::from(page - 1).saturating_mul(i64::from(page_size));
        let rows: Vec<(
            String,
            String,
            String,
            String,
            i32,
            String,
            String,
            String,
            Option<String>,
            Option<String>,
            Option<String>,
            Option<String>,
            bool,
        )> = sqlx::query_as(
            r#"SELECT
                   version.id::TEXT,
                   course.slug,
                   course.track_code,
                   version.cefr_level,
                   version.version_number,
                   version.status,
                   version.title,
                   version.description,
                   imported.imported_at::TEXT,
                   btrim(imported.package_sha256),
                   latest.decision,
                   latest.comments,
                   latest.reviewer_id::TEXT,
                   COALESCE(
                       version.status = 'review'
                       AND latest.decision = 'approved'
                       AND latest.reviewer_id = $1,
                       FALSE
                   ) AS can_publish
               FROM courses course
               JOIN course_versions version ON version.course_id = course.id
               LEFT JOIN curriculum_content_package_imports imported
                 ON imported.course_version_id = version.id
               LEFT JOIN LATERAL (
                   SELECT review.decision, review.comments, review.reviewer_id
                     FROM course_version_reviews review
                    WHERE review.course_version_id = version.id
                    ORDER BY review.review_order DESC
                    LIMIT 1
               ) latest ON TRUE
              WHERE ($2::TEXT IS NULL OR version.status = $2)
                AND ($3::TEXT IS NULL OR (
                    course.slug ILIKE '%' || $3 || '%'
                    OR version.title ILIKE '%' || $3 || '%'
                    OR version.description ILIKE '%' || $3 || '%'
                ))
              ORDER BY
                CASE version.status WHEN 'review' THEN 1 WHEN 'draft' THEN 2
                     WHEN 'published' THEN 3 ELSE 4 END,
                version.updated_at DESC,
                course.slug,
                version.cefr_level,
                version.version_number DESC
              LIMIT $4 OFFSET $5"#,
        )
        .bind(user_id)
        .bind(status.as_deref())
        .bind(search.as_deref())
        .bind(i64::from(page_size))
        .bind(offset)
        .fetch_all(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo consultar la cola editorial"))?;

        let items = rows
            .into_iter()
            .map(
                |(
                    version_id,
                    slug,
                    track_code,
                    cefr_level,
                    version_number,
                    status,
                    title,
                    description,
                    imported_at,
                    package_sha256,
                    latest_decision,
                    latest_comments,
                    latest_reviewer_id,
                    can_publish,
                )| EditorialCourseVersionSummary {
                    course_version_id: version_id,
                    slug,
                    track_code,
                    cefr_level,
                    version_number,
                    status,
                    title,
                    description,
                    imported_at: imported_at.unwrap_or_default(),
                    package_sha256: package_sha256.unwrap_or_default(),
                    latest_decision: latest_decision.unwrap_or_default(),
                    latest_comments: latest_comments.unwrap_or_default(),
                    latest_reviewer_id: latest_reviewer_id.unwrap_or_default(),
                    can_publish,
                },
            )
            .collect();

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta editorial"))?;
        let total_pages = if total == 0 {
            0
        } else {
            ((total + i64::from(page_size) - 1) / i64::from(page_size))
                .min(i64::from(i32::MAX)) as i32
        };

        Ok(Response::new(ListEditorialVersionsResponse {
            items,
            total: total.min(i64::from(i32::MAX)) as i32,
            page,
            page_size,
            total_pages,
        }))
    }

    async fn manage_editorial_version(
        &self,
        request: Request<ManageEditorialVersionRequest>,
    ) -> Result<Response<ManageEditorialVersionResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let course_version_id = Uuid::parse_str(&req.course_version_id)
            .map_err(|_| Status::invalid_argument("course_version_id inválido"))?;
        if !matches!(req.action.as_str(), "submit" | "review" | "publish") {
            return Err(Status::invalid_argument("La acción editorial no es válida"));
        }
        if req.action == "review"
            && !matches!(req.decision.as_str(), "approved" | "rejected" | "changes_requested")
        {
            return Err(Status::invalid_argument("La decisión editorial no es válida"));
        }
        if req.action == "review"
            && req.decision != "approved"
            && req.comments.trim().is_empty()
        {
            return Err(Status::invalid_argument(
                "Rechazar o solicitar cambios requiere comentarios editoriales",
            ));
        }
        if req.action != "review" && (!req.decision.is_empty() || !req.comments.is_empty()) {
            return Err(Status::invalid_argument(
                "decision y comments solo son válidos para una acción review",
            ));
        }
        if req.comments.len() > 4000 {
            return Err(Status::invalid_argument("Los comentarios no pueden superar 4000 caracteres"));
        }

        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la transición editorial"))?;
        common::set_current_user_id(&mut tx, user_id)
            .await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;
        let is_editor: bool = sqlx::query_scalar("SELECT app_is_content_editor()")
            .fetch_one(&mut *tx)
            .await
            .map_err(|_| Status::internal("No se pudo verificar la capacidad editorial"))?;
        if !is_editor {
            return Err(Status::permission_denied(
                "La cuenta no está registrada como editora de contenidos curriculares",
            ));
        }

        let previous_status: Option<String> = sqlx::query_scalar(
            "SELECT status FROM course_versions WHERE id = $1 FOR UPDATE",
        )
        .bind(course_version_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo consultar la versión curricular"))?;
        let previous_status =
            previous_status.ok_or_else(|| Status::not_found("Versión curricular no encontrada"))?;

        let (next_status, review_id, reviewed_at) = match req.action.as_str() {
            "submit" => {
                if previous_status != "draft" {
                    return Err(Status::failed_precondition(
                        "Solo una versión draft puede enviarse a revisión",
                    ));
                }
                sqlx::query(
                    r#"UPDATE course_versions
                          SET status = 'review',
                              submitted_at = CURRENT_TIMESTAMP,
                              updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1"#,
                )
                .bind(course_version_id)
                .execute(&mut *tx)
                .await
                .map_err(|_| Status::failed_precondition("No se pudo enviar la versión a revisión"))?;
                ("review".to_string(), String::new(), String::new())
            }
            "review" => {
                if previous_status != "review" {
                    return Err(Status::failed_precondition(
                        "Las decisiones editoriales requieren una versión en review",
                    ));
                }
                let row: (String, String) = sqlx::query_as(
                    r#"INSERT INTO course_version_reviews (
                           course_version_id, reviewer_id, decision, comments
                       )
                       VALUES ($1, $2, $3, $4)
                       RETURNING id::TEXT, reviewed_at::TEXT"#,
                )
                .bind(course_version_id)
                .bind(user_id)
                .bind(&req.decision)
                .bind(&req.comments)
                .fetch_one(&mut *tx)
                .await
                .map_err(|_| Status::failed_precondition("No se pudo registrar la decisión editorial"))?;
                let next = if req.decision == "approved" {
                    "review"
                } else {
                    sqlx::query(
                        "UPDATE course_versions SET status = 'draft', updated_at = CURRENT_TIMESTAMP WHERE id = $1",
                    )
                    .bind(course_version_id)
                    .execute(&mut *tx)
                    .await
                    .map_err(|_| Status::failed_precondition("No se pudo devolver la versión a draft"))?;
                    "draft"
                };
                (next.to_string(), row.0, row.1)
            }
            "publish" => {
                if previous_status != "review" {
                    return Err(Status::failed_precondition(
                        "Solo una versión en review puede publicarse",
                    ));
                }
                let latest: Option<(String, Uuid)> = sqlx::query_as(
                    r#"SELECT decision, reviewer_id
                         FROM course_version_reviews
                        WHERE course_version_id = $1
                        ORDER BY review_order DESC
                        LIMIT 1"#,
                )
                .bind(course_version_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|_| Status::internal("No se pudo comprobar la aprobación editorial"))?;
                if !matches!(latest, Some((ref decision, reviewer)) if decision == "approved" && reviewer == user_id) {
                    return Err(Status::failed_precondition(
                        "La última aprobación debe pertenecer al mismo editor que publica",
                    ));
                }
                sqlx::query(
                    r#"UPDATE course_versions
                          SET status = 'published',
                              reviewed_by = $2,
                              published_at = CURRENT_TIMESTAMP,
                              updated_at = CURRENT_TIMESTAMP
                        WHERE id = $1"#,
                )
                .bind(course_version_id)
                .bind(user_id)
                .execute(&mut *tx)
                .await
                .map_err(|_| Status::failed_precondition(
                    "La versión no cumple las condiciones de integridad para publicarse",
                ))?;
                ("published".to_string(), String::new(), String::new())
            }
            _ => unreachable!("editorial action was validated above"),
        };

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo confirmar la transición editorial"))?;

        Ok(Response::new(ManageEditorialVersionResponse {
            course_version_id: course_version_id.to_string(),
            action: req.action,
            previous_status,
            next_status,
            review_id,
            reviewed_at,
        }))
    }

    async fn import_curriculum_package(
        &self,
        request: Request<ImportCurriculumPackageRequest>,
    ) -> Result<Response<ImportCurriculumPackageResponse>, Status> {
        let user_id = common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();
        let (data, package_sha256, counts) = validate_package_json(&req.package_json)
            .map_err(Status::invalid_argument)?;

        let result = import_package(
            self.pool.as_ref(),
            user_id,
            &data,
            &package_sha256,
            counts,
            req.apply,
        )
        .await
        .map_err(|error| {
            if error.contains("content_editors") {
                Status::permission_denied(error)
            } else if error.contains("ya existe") || error.contains("no se sobrescribirá") {
                Status::already_exists(error)
            } else if error.contains("no encontrada")
                || error.contains("ambigua")
                || error.contains("no existe")
                || error.contains("no está asociado")
            {
                Status::failed_precondition(error)
            } else {
                Status::internal(error)
            }
        })?;

        Ok(Response::new(ImportCurriculumPackageResponse {
            state: result.state,
            course_version_id: result.course_version_id,
            package_sha256: result.package_sha256,
            units: result.counts.units,
            lessons: result.counts.lessons,
            objectives: result.counts.objectives,
            vocabulary_references: result.counts.vocabulary_references,
            sentence_references: result.counts.sentence_references,
            applied: result.applied,
            dry_run: result.dry_run,
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


#[cfg(test)]
mod curriculum_progress_tests {
    use super::{evaluate_lesson_progress, validate_student_catalog_query};
    use proto::content::{CurriculumPrerequisite, ListCurriculumCoursesRequest};
    use std::collections::HashMap;
    use uuid::Uuid;

    type Evidence = (i32, i32, f64, bool, bool);

    fn prerequisite(id: Uuid, state: &str, score: f64) -> CurriculumPrerequisite {
        CurriculumPrerequisite {
            prerequisite_lesson_id: id.to_string(),
            required_state: state.to_string(),
            minimum_mastery_score: score,
        }
    }

    #[test]
    fn student_catalog_query_uses_safe_defaults_and_normalizes_search() {
        let request = ListCurriculumCoursesRequest {
            page: 0,
            page_size: 0,
            search_query: "  English GENERAL  ".to_string(),
            ..Default::default()
        };
        let filters = validate_student_catalog_query(&request).expect("defaults are valid");
        assert_eq!(filters.page, 1);
        assert_eq!(filters.page_size, 12);
        assert_eq!(filters.search.as_deref(), Some("english general"));
        assert!(filters.track.is_none());
        assert!(filters.level.is_none());
    }

    #[test]
    fn student_catalog_query_rejects_oversized_or_unknown_filters() {
        let oversized_page = ListCurriculumCoursesRequest {
            page_size: 51,
            ..Default::default()
        };
        assert!(validate_student_catalog_query(&oversized_page).is_err());

        let invalid_track = ListCurriculumCoursesRequest {
            track_code: "all".to_string(),
            ..Default::default()
        };
        assert!(validate_student_catalog_query(&invalid_track).is_err());

        let invalid_level = ListCurriculumCoursesRequest {
            cefr_level: "C3".to_string(),
            ..Default::default()
        };
        assert!(validate_student_catalog_query(&invalid_level).is_err());

        let oversized_search = ListCurriculumCoursesRequest {
            search_query: "a".repeat(121),
            ..Default::default()
        };
        assert!(validate_student_catalog_query(&oversized_search).is_err());
    }

    #[test]
    fn lesson_is_not_enrolled_without_a_course_enrollment() {
        let result = evaluate_lesson_progress(
            false,
            (1, 0, 0.0, false, false),
            &[],
            &HashMap::new(),
        );

        assert_eq!(result.state, "not_enrolled");
        assert!(!result.prerequisites_satisfied);
    }

    #[test]
    fn lesson_is_available_when_all_completed_prerequisites_are_met() {
        let prerequisite_id = Uuid::new_v4();
        let current_evidence: Evidence = (1, 0, 0.0, false, false);
        let mut evidence = HashMap::new();
        evidence.insert(prerequisite_id, (1, 1, 0.4, true, false));

        let result = evaluate_lesson_progress(
            true,
            current_evidence,
            &[prerequisite(prerequisite_id, "completed", 0.0)],
            &evidence,
        );

        assert_eq!(result.state, "available");
        assert!(result.prerequisites_satisfied);
    }

    #[test]
    fn lesson_stays_locked_when_mastery_prerequisite_is_below_threshold() {
        let prerequisite_id = Uuid::new_v4();
        let mut evidence = HashMap::new();
        evidence.insert(prerequisite_id, (1, 1, 0.79, true, false));

        let result = evaluate_lesson_progress(
            true,
            (1, 0, 0.0, false, false),
            &[prerequisite(prerequisite_id, "mastered", 0.8)],
            &evidence,
        );

        assert_eq!(result.state, "locked");
        assert!(!result.prerequisites_satisfied);
    }

    #[test]
    fn lesson_is_completed_or_mastered_only_when_required_evidence_says_so() {
        let completed = evaluate_lesson_progress(
            true,
            (2, 2, 0.6, true, false),
            &[],
            &HashMap::new(),
        );
        assert_eq!(completed.state, "completed");
        assert_eq!(completed.completed_objectives, 2);

        let mastered = evaluate_lesson_progress(
            true,
            (2, 2, 0.9, true, true),
            &[],
            &HashMap::new(),
        );
        assert_eq!(mastered.state, "mastered");
        assert_eq!(mastered.mastery_score, 0.9);
    }

    #[test]
    fn malformed_or_missing_prerequisite_evidence_fails_closed() {
        let result = evaluate_lesson_progress(
            true,
            (1, 0, 0.0, false, false),
            &[prerequisite(Uuid::new_v4(), "completed", 0.0)],
            &HashMap::new(),
        );
        assert_eq!(result.state, "locked");

        let malformed = CurriculumPrerequisite {
            prerequisite_lesson_id: "not-a-uuid".to_string(),
            required_state: "completed".to_string(),
            minimum_mastery_score: 0.0,
        };
        let result = evaluate_lesson_progress(
            true,
            (1, 0, 0.0, false, false),
            &[malformed],
            &HashMap::new(),
        );
        assert_eq!(result.state, "locked");
    }
}
