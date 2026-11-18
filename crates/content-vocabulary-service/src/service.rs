use proto::content::content_service_server::ContentService;
use proto::content::{
    ContextSentence, CurriculumCourseSummary, CurriculumLesson, CurriculumObjective,
    CurriculumPrerequisite, CurriculumUnit, EnrollInCourseRequest, EnrollInCourseResponse,
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
        let limit = if req.limit <= 0 {
            20
        } else {
            req.limit.min(50)
        };
        if req.offset < 0 || req.offset > 1_000_000 {
            return Err(Status::invalid_argument(
                "offset debe estar entre 0 y 1000000",
            ));
        }
        let offset = req.offset;
        let track_code = req.track_code.trim().to_ascii_lowercase();
        if !track_code.is_empty() && !matches!(track_code.as_str(), "general" | "technology") {
            return Err(Status::invalid_argument("track_code no es válido"));
        }
        let cefr_level = req.cefr_level.trim().to_ascii_uppercase();
        if !cefr_level.is_empty()
            && !matches!(
                cefr_level.as_str(),
                "PRE_A1" | "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
            )
        {
            return Err(Status::invalid_argument("cefr_level no es válido"));
        }
        let search = req.search.trim();
        if search.chars().count() > 100 {
            return Err(Status::invalid_argument(
                "search no puede superar 100 caracteres",
            ));
        }

        let mut tx = self
            .pool
            .begin()
            .await
            .map_err(|_| Status::internal("No se pudo iniciar la consulta curricular"))?;
        common::set_current_user_id(&mut tx, user_id)
            .await
            .map_err(|_| Status::internal("No se pudo establecer el contexto RLS"))?;

        let total: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*)
                 FROM courses course
                 JOIN course_versions version ON version.course_id = course.id
                WHERE (version.status = 'published'
                       OR EXISTS (
                           SELECT 1 FROM course_enrollments enrollment
                            WHERE enrollment.course_version_id = version.id
                              AND enrollment.user_id = $1
                       ))
                  AND ($2 = '' OR course.track_code = $2)
                  AND ($3 = '' OR version.cefr_level = $3)
                  AND ($4 = '' OR version.title ILIKE '%' || $4 || '%'
                                  OR course.slug ILIKE '%' || $4 || '%')"#,
        )
        .bind(user_id)
        .bind(&track_code)
        .bind(&cefr_level)
        .bind(search)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| Status::internal("No se pudo contar el catálogo curricular"))?;

        let rows: Vec<(String, String, String, i32, String, String, String, i64, i64, i64, bool, String)> =
            sqlx::query_as(
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
                  WHERE (version.status = 'published'
                         OR EXISTS (
                             SELECT 1 FROM course_enrollments enrollment
                              WHERE enrollment.course_version_id = version.id
                                AND enrollment.user_id = $1
                         ))
                    AND ($2 = '' OR course.track_code = $2)
                    AND ($3 = '' OR version.cefr_level = $3)
                    AND ($4 = '' OR version.title ILIKE '%' || $4 || '%'
                                    OR course.slug ILIKE '%' || $4 || '%')
                  ORDER BY
                    CASE course.track_code WHEN 'general' THEN 1 ELSE 2 END,
                    CASE version.cefr_level
                      WHEN 'PRE_A1' THEN 1 WHEN 'A1' THEN 2 WHEN 'A2' THEN 3
                      WHEN 'B1' THEN 4 WHEN 'B2' THEN 5 WHEN 'C1' THEN 6 ELSE 7
                    END,
                    course.slug,
                    version.version_number DESC
                  LIMIT $5 OFFSET $6"#,
            )
            .bind(user_id)
            .bind(&track_code)
            .bind(&cefr_level)
            .bind(search)
            .bind(limit as i64)
            .bind(offset as i64)
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
                )| CurriculumCourseSummary {
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
                },
            )
            .collect();

        tx.commit()
            .await
            .map_err(|_| Status::internal("No se pudo cerrar la consulta curricular"))?;

        Ok(Response::new(ListCurriculumCoursesResponse {
            items,
            total: total.min(i32::MAX as i64) as i32,
            limit,
            offset,
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
                    )
                  LIMIT 1"#,
        )
        .bind(course_version_id)
        .bind(user_id)
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

        let mut objectives_by_lesson: HashMap<Uuid, Vec<CurriculumObjective>> = HashMap::new();
        for (lesson_id, id, code, objective, criteria, position, required, skills) in objective_rows
        {
            objectives_by_lesson
                .entry(lesson_id)
                .or_default()
                .push(CurriculumObjective {
                    id: id.to_string(),
                    objective_code: code,
                    description: objective,
                    success_criteria: criteria,
                    position,
                    required,
                    skills,
                });
        }

        let mut prerequisites_by_lesson: HashMap<Uuid, Vec<CurriculumPrerequisite>> =
            HashMap::new();
        for (lesson_id, prerequisite_id, required_state, minimum_mastery_score) in prerequisite_rows
        {
            prerequisites_by_lesson
                .entry(lesson_id)
                .or_default()
                .push(CurriculumPrerequisite {
                    prerequisite_lesson_id: prerequisite_id.to_string(),
                    required_state,
                    minimum_mastery_score,
                });
        }

        let mut lessons_by_unit: HashMap<Uuid, Vec<CurriculumLesson>> = HashMap::new();
        for (id, unit_id, code, position, pattern, lesson_title, lesson_description, minutes) in
            lesson_rows
        {
            lessons_by_unit
                .entry(unit_id)
                .or_default()
                .push(CurriculumLesson {
                    id: id.to_string(),
                    lesson_code: code,
                    position,
                    lesson_pattern: pattern,
                    title: lesson_title,
                    description: lesson_description,
                    estimated_minutes: minutes.unwrap_or_default(),
                    objectives: objectives_by_lesson.remove(&id).unwrap_or_default(),
                    prerequisites: prerequisites_by_lesson.remove(&id).unwrap_or_default(),
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
