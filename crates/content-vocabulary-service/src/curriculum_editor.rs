use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::collections::{HashMap, HashSet};
use std::fmt;
use uuid::Uuid;

const MAX_DRAFT_BYTES: usize = 1_500_000;
const MAX_UNITS: usize = 100;
const MAX_LESSONS: usize = 500;
const MAX_OBJECTIVES: usize = 1000;

#[derive(Debug)]
pub enum DraftEditError {
    Forbidden,
    NotFound,
    Conflict(String),
    Invalid(String),
    Database,
}

impl fmt::Display for DraftEditError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Forbidden => write!(formatter, "La cuenta no está registrada en content_editors"),
            Self::NotFound => write!(formatter, "Versión curricular no encontrada"),
            Self::Conflict(message) | Self::Invalid(message) => write!(formatter, "{message}"),
            Self::Database => write!(formatter, "No se pudo guardar el borrador curricular"),
        }
    }
}

impl std::error::Error for DraftEditError {}

#[derive(Debug, Clone)]
pub struct DraftSaveResult {
    pub course_version_id: String,
    pub updated_at: String,
    pub revision_number: i32,
    pub content_sha256: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DraftDocument {
    title: String,
    description: String,
    units: Vec<DraftUnit>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DraftUnit {
    id: String,
    title: String,
    theme: String,
    description: String,
    estimated_minutes: Option<i32>,
    lessons: Vec<DraftLesson>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DraftLesson {
    id: String,
    title: String,
    description: String,
    estimated_minutes: Option<i32>,
    objectives: Vec<DraftObjective>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DraftObjective {
    id: String,
    description: String,
    success_criteria: String,
}

fn validate_text(
    value: &str,
    field: &str,
    max_chars: usize,
    allow_empty: bool,
) -> Result<(), DraftEditError> {
    if !allow_empty && value.trim().is_empty() {
        return Err(DraftEditError::Invalid(format!("{field} no puede estar vacío")));
    }
    if value.chars().count() > max_chars {
        return Err(DraftEditError::Invalid(format!(
            "{field} supera el máximo de {max_chars} caracteres"
        )));
    }
    Ok(())
}

fn parse_id(value: &str, field: &str) -> Result<Uuid, DraftEditError> {
    Uuid::parse_str(value)
        .map_err(|_| DraftEditError::Invalid(format!("{field} contiene un UUID inválido")))
}

fn validate_minutes(value: Option<i32>, field: &str) -> Result<(), DraftEditError> {
    if value.is_some_and(|minutes| !(1..=2400).contains(&minutes)) {
        return Err(DraftEditError::Invalid(format!(
            "{field} debe estar entre 1 y 2400 minutos o ser nulo"
        )));
    }
    Ok(())
}

fn parse_draft(raw: &str) -> Result<(DraftDocument, serde_json::Value, String), DraftEditError> {
    if raw.trim().is_empty() || raw.len() > MAX_DRAFT_BYTES {
        return Err(DraftEditError::Invalid(
            "El borrador está vacío o supera el límite de 1.5 MB".to_string(),
        ));
    }
    let draft: DraftDocument = serde_json::from_str(raw).map_err(|error| {
        DraftEditError::Invalid(format!("JSON de borrador inválido: {error}"))
    })?;
    validate_text(&draft.title, "title", 200, false)?;
    validate_text(&draft.description, "description", 6000, true)?;
    if draft.units.is_empty() || draft.units.len() > MAX_UNITS {
        return Err(DraftEditError::Invalid(format!(
            "El borrador debe contener entre 1 y {MAX_UNITS} unidades"
        )));
    }

    let mut unit_ids = HashSet::new();
    let mut lesson_ids = HashSet::new();
    let mut objectives = HashMap::<Uuid, DraftObjective>::new();
    let mut lesson_count = 0usize;

    for (unit_index, unit) in draft.units.iter().enumerate() {
        let unit_path = format!("units[{unit_index}]");
        let unit_id = parse_id(&unit.id, &format!("{unit_path}.id"))?;
        if !unit_ids.insert(unit_id) {
            return Err(DraftEditError::Invalid(format!(
                "La unidad {} aparece más de una vez",
                unit.id
            )));
        }
        validate_text(&unit.title, &format!("{unit_path}.title"), 200, false)?;
        validate_text(&unit.theme, &format!("{unit_path}.theme"), 120, true)?;
        validate_text(
            &unit.description,
            &format!("{unit_path}.description"),
            6000,
            true,
        )?;
        validate_minutes(unit.estimated_minutes, &format!("{unit_path}.estimatedMinutes"))?;
        if unit.lessons.is_empty() {
            return Err(DraftEditError::Invalid(format!(
                "La unidad {} debe conservar al menos una lección",
                unit.title
            )));
        }

        for (lesson_index, lesson) in unit.lessons.iter().enumerate() {
            lesson_count += 1;
            if lesson_count > MAX_LESSONS {
                return Err(DraftEditError::Invalid(format!(
                    "El borrador supera el máximo de {MAX_LESSONS} lecciones"
                )));
            }
            let lesson_path = format!("{unit_path}.lessons[{lesson_index}]");
            let lesson_id = parse_id(&lesson.id, &format!("{lesson_path}.id"))?;
            if !lesson_ids.insert(lesson_id) {
                return Err(DraftEditError::Invalid(format!(
                    "La lección {} aparece más de una vez",
                    lesson.id
                )));
            }
            validate_text(&lesson.title, &format!("{lesson_path}.title"), 200, false)?;
            validate_text(
                &lesson.description,
                &format!("{lesson_path}.description"),
                6000,
                true,
            )?;
            validate_minutes(
                lesson.estimated_minutes,
                &format!("{lesson_path}.estimatedMinutes"),
            )?;
            if lesson.objectives.is_empty() {
                return Err(DraftEditError::Invalid(format!(
                    "La lección {} debe conservar sus objetivos vinculados",
                    lesson.title
                )));
            }
            for (objective_index, objective) in lesson.objectives.iter().enumerate() {
                let objective_path = format!("{lesson_path}.objectives[{objective_index}]");
                let objective_id = parse_id(&objective.id, &format!("{objective_path}.id"))?;
                validate_text(
                    &objective.description,
                    &format!("{objective_path}.description"),
                    2000,
                    false,
                )?;
                validate_text(
                    &objective.success_criteria,
                    &format!("{objective_path}.successCriteria"),
                    4000,
                    false,
                )?;
                if let Some(existing) = objectives.get(&objective_id) {
                    if existing != objective {
                        return Err(DraftEditError::Invalid(format!(
                            "El objetivo {} tiene ediciones contradictorias entre lecciones",
                            objective.id
                        )));
                    }
                } else {
                    objectives.insert(objective_id, objective.clone());
                }
            }
        }
    }

    if objectives.is_empty() || objectives.len() > MAX_OBJECTIVES {
        return Err(DraftEditError::Invalid(format!(
            "El borrador debe contener entre 1 y {MAX_OBJECTIVES} objetivos vinculados"
        )));
    }

    let snapshot = serde_json::to_value(&draft)
        .map_err(|_| DraftEditError::Invalid("No se pudo normalizar el borrador".to_string()))?;
    let bytes = serde_json::to_vec(&draft)
        .map_err(|_| DraftEditError::Invalid("No se pudo calcular la huella del borrador".to_string()))?;
    let content_sha256 = format!("{:x}", Sha256::digest(bytes));
    Ok((draft, snapshot, content_sha256))
}

pub async fn save_curriculum_draft(
    pool: &PgPool,
    actor_user_id: Uuid,
    course_version_id: Uuid,
    expected_updated_at: &str,
    raw_draft: &str,
) -> Result<DraftSaveResult, DraftEditError> {
    if expected_updated_at.trim().is_empty() || expected_updated_at.len() > 80 {
        return Err(DraftEditError::Invalid(
            "expected_updated_at es obligatorio".to_string(),
        ));
    }
    let (draft, snapshot, content_sha256) = parse_draft(raw_draft)?;

    let mut tx = pool.begin().await.map_err(|_| DraftEditError::Database)?;
    sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
        .bind(actor_user_id.to_string())
        .execute(&mut *tx)
        .await
        .map_err(|_| DraftEditError::Database)?;
    let is_editor: bool = sqlx::query_scalar("SELECT app_is_content_editor()")
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| DraftEditError::Database)?;
    if !is_editor {
        return Err(DraftEditError::Forbidden);
    }

    // The parent lock serializes visual saves with submission into editorial review.
    let version: Option<(String, String)> = sqlx::query_as(
        "SELECT status, updated_at::TEXT FROM course_versions WHERE id = $1 FOR UPDATE",
    )
    .bind(course_version_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| DraftEditError::Database)?;
    let (status, current_updated_at) = version.ok_or(DraftEditError::NotFound)?;
    if status != "draft" {
        return Err(DraftEditError::Conflict(
            "Solo se puede editar una versión en estado draft; las versiones en revisión o publicadas están congeladas".to_string(),
        ));
    }
    if current_updated_at != expected_updated_at {
        return Err(DraftEditError::Conflict(
            "El borrador fue actualizado por otra persona. Recarga la versión antes de guardar".to_string(),
        ));
    }

    // This API is deliberately field-only. Compare IDs and parent relationships
    // to the stored structure before accepting any mutation.
    let stored_units: Vec<(Uuid, i32)> = sqlx::query_as(
        "SELECT id, position FROM course_units WHERE course_version_id = $1 ORDER BY position, id",
    )
    .bind(course_version_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|_| DraftEditError::Database)?;
    let submitted_unit_ids: Vec<Uuid> = draft
        .units
        .iter()
        .map(|unit| parse_id(&unit.id, "units.id"))
        .collect::<Result<_, _>>()?;
    let stored_unit_ids: Vec<Uuid> = stored_units.iter().map(|(id, _)| *id).collect();
    if submitted_unit_ids != stored_unit_ids {
        return Err(DraftEditError::Invalid(
            "El editor no puede agregar, quitar, reordenar ni mover unidades".to_string(),
        ));
    }

    let stored_lessons: Vec<(Uuid, Uuid, i32)> = sqlx::query_as(
        "SELECT id, unit_id, position FROM course_lessons WHERE course_version_id = $1 ORDER BY unit_id, position, id",
    )
    .bind(course_version_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|_| DraftEditError::Database)?;
    let mut stored_lessons_by_unit = HashMap::<Uuid, Vec<Uuid>>::new();
    let mut lesson_unit_by_id = HashMap::<Uuid, Uuid>::new();
    for (lesson_id, unit_id, _) in stored_lessons {
        stored_lessons_by_unit.entry(unit_id).or_default().push(lesson_id);
        lesson_unit_by_id.insert(lesson_id, unit_id);
    }

    let stored_objective_links: Vec<(Uuid, Uuid)> = sqlx::query_as(
        "SELECT lesson_id, learning_objective_id FROM lesson_learning_objectives WHERE course_version_id = $1 ORDER BY lesson_id, position",
    )
    .bind(course_version_id)
    .fetch_all(&mut *tx)
    .await
    .map_err(|_| DraftEditError::Database)?;
    let mut stored_objectives_by_lesson = HashMap::<Uuid, Vec<Uuid>>::new();
    let mut stored_objective_ids = HashSet::<Uuid>::new();
    for (lesson_id, objective_id) in stored_objective_links {
        stored_objectives_by_lesson.entry(lesson_id).or_default().push(objective_id);
        stored_objective_ids.insert(objective_id);
    }

    let mut submitted_lesson_ids = HashSet::new();
    let mut submitted_objective_ids = HashSet::new();
    for unit in &draft.units {
        let unit_id = parse_id(&unit.id, "units.id")?;
        let submitted_for_unit: Vec<Uuid> = unit
            .lessons
            .iter()
            .map(|lesson| parse_id(&lesson.id, "lessons.id"))
            .collect::<Result<_, _>>()?;
        let stored_for_unit = stored_lessons_by_unit.get(&unit_id).cloned().unwrap_or_default();
        if submitted_for_unit != stored_for_unit {
            return Err(DraftEditError::Invalid(format!(
                "No se puede mover, agregar, quitar ni reordenar lecciones en la unidad {}",
                unit.title
            )));
        }

        for lesson in &unit.lessons {
            let lesson_id = parse_id(&lesson.id, "lessons.id")?;
            if lesson_unit_by_id.get(&lesson_id) != Some(&unit_id) {
                return Err(DraftEditError::Invalid(
                    "La relación entre unidades y lecciones no puede cambiarse desde este editor".to_string(),
                ));
            }
            submitted_lesson_ids.insert(lesson_id);
            let submitted_objectives: Vec<Uuid> = lesson
                .objectives
                .iter()
                .map(|objective| parse_id(&objective.id, "objectives.id"))
                .collect::<Result<_, _>>()?;
            let stored_for_lesson = stored_objectives_by_lesson
                .get(&lesson_id)
                .cloned()
                .unwrap_or_default();
            if submitted_objectives != stored_for_lesson {
                return Err(DraftEditError::Invalid(format!(
                    "No se pueden agregar, quitar, mover ni reordenar objetivos en la lección {}",
                    lesson.title
                )));
            }
            submitted_objective_ids.extend(submitted_objectives);
        }
    }
    if submitted_lesson_ids.len() != lesson_unit_by_id.len()
        || submitted_objective_ids != stored_objective_ids
    {
        return Err(DraftEditError::Invalid(
            "La estructura enviada no coincide con la versión almacenada".to_string(),
        ));
    }

    let last_revision: Option<(i32, String)> = sqlx::query_as(
        "SELECT revision_number, btrim(content_sha256) FROM curriculum_draft_revisions WHERE course_version_id = $1 ORDER BY revision_number DESC LIMIT 1",
    )
    .bind(course_version_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|_| DraftEditError::Database)?;
    if let Some((revision_number, previous_hash)) = last_revision.as_ref() {
        if previous_hash == &content_sha256 {
            tx.rollback().await.map_err(|_| DraftEditError::Database)?;
            return Ok(DraftSaveResult {
                course_version_id: course_version_id.to_string(),
                updated_at: current_updated_at,
                revision_number: *revision_number,
                content_sha256,
            });
        }
    }

    for unit in &draft.units {
        let unit_id = parse_id(&unit.id, "units.id")?;
        let updated = sqlx::query(
            "UPDATE course_units SET title = $3, theme = $4, description = $5, estimated_minutes = $6 WHERE id = $1 AND course_version_id = $2",
        )
        .bind(unit_id)
        .bind(course_version_id)
        .bind(&unit.title)
        .bind(&unit.theme)
        .bind(&unit.description)
        .bind(unit.estimated_minutes)
        .execute(&mut *tx)
        .await
        .map_err(|_| DraftEditError::Database)?;
        if updated.rows_affected() != 1 {
            return Err(DraftEditError::Conflict(
                "La unidad cambió durante el guardado; vuelve a cargar el borrador".to_string(),
            ));
        }

        for lesson in &unit.lessons {
            let lesson_id = parse_id(&lesson.id, "lessons.id")?;
            let updated = sqlx::query(
                "UPDATE course_lessons SET title = $3, description = $4, estimated_minutes = $5 WHERE id = $1 AND course_version_id = $2 AND unit_id = $6",
            )
            .bind(lesson_id)
            .bind(course_version_id)
            .bind(&lesson.title)
            .bind(&lesson.description)
            .bind(lesson.estimated_minutes)
            .bind(unit_id)
            .execute(&mut *tx)
            .await
            .map_err(|_| DraftEditError::Database)?;
            if updated.rows_affected() != 1 {
                return Err(DraftEditError::Conflict(
                    "La lección cambió durante el guardado; vuelve a cargar el borrador".to_string(),
                ));
            }
        }
    }

    let mut objective_updates = HashMap::<Uuid, DraftObjective>::new();
    for objective in draft.units.iter()
        .flat_map(|unit| unit.lessons.iter())
        .flat_map(|lesson| lesson.objectives.iter())
    {
        objective_updates.insert(
            parse_id(&objective.id, "objectives.id")?,
            objective.clone(),
        );
    }
    for (objective_id, objective) in objective_updates {
        let updated = sqlx::query(
            "UPDATE learning_objectives SET description = $3, success_criteria = $4 WHERE id = $1 AND course_version_id = $2",
        )
        .bind(objective_id)
        .bind(course_version_id)
        .bind(&objective.description)
        .bind(&objective.success_criteria)
        .execute(&mut *tx)
        .await
        .map_err(|_| DraftEditError::Database)?;
        if updated.rows_affected() != 1 {
            return Err(DraftEditError::Conflict(
                "Un objetivo cambió durante el guardado; vuelve a cargar el borrador".to_string(),
            ));
        }
    }

    let updated_at: String = sqlx::query_scalar(
        "UPDATE course_versions SET title = $2, description = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND status = 'draft' RETURNING updated_at::TEXT",
    )
    .bind(course_version_id)
    .bind(&draft.title)
    .bind(&draft.description)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| DraftEditError::Conflict(
        "La versión dejó de ser editable; recarga la cola editorial".to_string(),
    ))?;

    let revision_number = last_revision
        .map(|(number, _)| number.saturating_add(1))
        .unwrap_or(1);
    sqlx::query(
        "INSERT INTO curriculum_draft_revisions (course_version_id, revision_number, content_sha256, snapshot, created_by) VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(course_version_id)
    .bind(revision_number)
    .bind(&content_sha256)
    .bind(snapshot)
    .bind(actor_user_id)
    .execute(&mut *tx)
    .await
    .map_err(|_| DraftEditError::Database)?;

    tx.commit().await.map_err(|_| DraftEditError::Database)?;
    Ok(DraftSaveResult {
        course_version_id: course_version_id.to_string(),
        updated_at,
        revision_number,
        content_sha256,
    })
}

#[cfg(test)]
mod tests {
    use super::parse_draft;
    use serde_json::json;
    use uuid::Uuid;

    fn valid_draft() -> serde_json::Value {
        json!({
            "title": "English General",
            "description": "",
            "units": [{
                "id": Uuid::new_v4().to_string(),
                "title": "Unit 1",
                "theme": "People",
                "description": "",
                "estimatedMinutes": 30,
                "lessons": [{
                    "id": Uuid::new_v4().to_string(),
                    "title": "Greetings",
                    "description": "",
                    "estimatedMinutes": 15,
                    "objectives": [{
                        "id": Uuid::new_v4().to_string(),
                        "description": "Greet someone",
                        "successCriteria": "Use a greeting in context"
                    }]
                }]
            }]
        })
    }

    #[test]
    fn parses_scoped_visual_draft_and_returns_sha256() {
        let raw = valid_draft().to_string();
        let (_, _, hash) = parse_draft(&raw).expect("valid draft");
        assert_eq!(hash.len(), 64);
        assert!(hash.chars().all(|character| character.is_ascii_hexdigit()));
    }

    #[test]
    fn rejects_unknown_structural_fields() {
        let mut draft = valid_draft();
        draft["units"][0]["lessons"][0]["lessonPattern"] = json!("discover");
        assert!(parse_draft(&draft.to_string()).is_err());
    }

    #[test]
    fn rejects_invalid_text_and_time_values() {
        let mut draft = valid_draft();
        draft["title"] = json!(" ");
        assert!(parse_draft(&draft.to_string()).is_err());

        let mut draft = valid_draft();
        draft["units"][0]["estimatedMinutes"] = json!(0);
        assert!(parse_draft(&draft.to_string()).is_err());
    }

    #[test]
    fn rejects_duplicate_unit_ids() {
        let mut draft = valid_draft();
        let first = draft["units"][0].clone();
        draft["units"].as_array_mut().expect("units array").push(first);
        assert!(parse_draft(&draft.to_string()).is_err());
    }


    #[tokio::test]
    async fn postgres_save_is_versioned_rejects_stale_writes_and_freezes_review() {
        let Ok(database_url) = std::env::var("TEST_DATABASE_URL") else {
            return;
        };
        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(3)
            .connect(&database_url)
            .await
            .expect("connect to TEST_DATABASE_URL");

        let actor_id = Uuid::new_v4();
        let course_id = Uuid::new_v4();
        let version_id = Uuid::new_v4();
        let unit_id = Uuid::new_v4();
        let lesson_id = Uuid::new_v4();
        let objective_id = Uuid::new_v4();
        let suffix = Uuid::new_v4().simple().to_string();
        let email = format!("draft-editor-{suffix}@tests.invalid");
        let slug = format!("draft-editor-{suffix}");

        let mut seed = pool.begin().await.expect("begin seed transaction");
        sqlx::query(
            "INSERT INTO users (id, email, password_hash, full_name, target_role, current_level) VALUES ($1, $2, 'not-a-login-hash', 'Draft editor test', 'SYSTEM', 'A1')",
        )
        .bind(actor_id)
        .bind(email)
        .execute(&mut *seed)
        .await
        .expect("insert test user");
        sqlx::query("INSERT INTO content_editors (user_id) VALUES ($1)")
            .bind(actor_id)
            .execute(&mut *seed)
            .await
            .expect("grant editor capability");
        sqlx::query("SELECT set_config('app.current_user_id', $1, true)")
            .bind(actor_id.to_string())
            .execute(&mut *seed)
            .await
            .expect("set editor context");
        sqlx::query("INSERT INTO courses (id, slug, track_code) VALUES ($1, $2, 'general')")
            .bind(course_id)
            .bind(slug)
            .execute(&mut *seed)
            .await
            .expect("insert course");
        sqlx::query(
            "INSERT INTO course_versions (id, course_id, version_number, status, cefr_level, title, description, created_by) VALUES ($1, $2, 1, 'draft', 'A1', 'Original title', 'Original description', $3)",
        )
        .bind(version_id)
        .bind(course_id)
        .bind(actor_id)
        .execute(&mut *seed)
        .await
        .expect("insert draft version");
        sqlx::query(
            "INSERT INTO course_units (id, course_version_id, unit_code, position, title, theme, description, estimated_minutes) VALUES ($1, $2, 'unit-1', 1, 'Original unit', 'People', '', 20)",
        )
        .bind(unit_id)
        .bind(version_id)
        .execute(&mut *seed)
        .await
        .expect("insert course unit");
        sqlx::query(
            "INSERT INTO learning_objectives (id, course_version_id, objective_code, description, success_criteria, position) VALUES ($1, $2, 'greet', 'Greet someone', 'Use a greeting in context', 1)",
        )
        .bind(objective_id)
        .bind(version_id)
        .execute(&mut *seed)
        .await
        .expect("insert learning objective");
        sqlx::query(
            "INSERT INTO learning_objective_skills (course_version_id, learning_objective_id, skill_code, is_primary) VALUES ($1, $2, 'interaction', TRUE)",
        )
        .bind(version_id)
        .bind(objective_id)
        .execute(&mut *seed)
        .await
        .expect("insert objective skill");
        sqlx::query(
            "INSERT INTO course_lessons (id, course_version_id, unit_id, lesson_code, position, title, description, estimated_minutes) VALUES ($1, $2, $3, 'greetings', 1, 'Original lesson', '', 10)",
        )
        .bind(lesson_id)
        .bind(version_id)
        .bind(unit_id)
        .execute(&mut *seed)
        .await
        .expect("insert lesson");
        sqlx::query(
            "INSERT INTO lesson_learning_objectives (course_version_id, lesson_id, learning_objective_id, position, is_required) VALUES ($1, $2, $3, 1, TRUE)",
        )
        .bind(version_id)
        .bind(lesson_id)
        .bind(objective_id)
        .execute(&mut *seed)
        .await
        .expect("link required objective");
        seed.commit().await.expect("commit seed transaction");

        let expected_updated_at: String = sqlx::query_scalar(
            "SELECT updated_at::TEXT FROM course_versions WHERE id = $1",
        )
        .bind(version_id)
        .fetch_one(&pool)
        .await
        .expect("read initial optimistic token");
        let draft = serde_json::json!({
            "title": "Edited title",
            "description": "Edited description",
            "units": [{
                "id": unit_id,
                "title": "Edited unit",
                "theme": "People",
                "description": "New unit description",
                "estimatedMinutes": 25,
                "lessons": [{
                    "id": lesson_id,
                    "title": "Edited lesson",
                    "description": "New lesson description",
                    "estimatedMinutes": 15,
                    "objectives": [{
                        "id": objective_id,
                        "description": "Greet a new person",
                        "successCriteria": "Use a natural greeting in a short exchange"
                    }]
                }]
            }]
        });
        let mut tampered = draft.clone();
        tampered["units"][0]["lessons"][0]["id"] = serde_json::json!(Uuid::new_v4().to_string());
        let structural_edit = save_curriculum_draft(
            &pool,
            actor_id,
            version_id,
            &expected_updated_at,
            &tampered.to_string(),
        )
        .await;
        assert!(matches!(structural_edit, Err(DraftEditError::Invalid(_))));

        let raw = draft.to_string();
        let saved = save_curriculum_draft(
            &pool,
            actor_id,
            version_id,
            &expected_updated_at,
            &raw,
        )
        .await
        .expect("save initial visual revision");
        assert_eq!(saved.revision_number, 1);
        assert_eq!(saved.content_sha256.len(), 64);

        let persisted: (String, String, String, i32) = sqlx::query_as(
            r#"SELECT version.title, unit.title, lesson.title, revision.revision_number
                 FROM course_versions version
                 JOIN course_units unit ON unit.course_version_id = version.id
                 JOIN course_lessons lesson ON lesson.unit_id = unit.id
                 JOIN curriculum_draft_revisions revision ON revision.course_version_id = version.id
                WHERE version.id = $1"#,
        )
        .bind(version_id)
        .fetch_one(&pool)
        .await
        .expect("read saved revision");
        assert_eq!(persisted.0, "Edited title");
        assert_eq!(persisted.1, "Edited unit");
        assert_eq!(persisted.2, "Edited lesson");
        assert_eq!(persisted.3, 1);

        let stale = save_curriculum_draft(
            &pool,
            actor_id,
            version_id,
            &expected_updated_at,
            &draft.to_string(),
        )
        .await;
        assert!(matches!(stale, Err(DraftEditError::Conflict(_))));

        sqlx::query(
            "UPDATE course_versions SET status = 'review', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        )
        .bind(version_id)
        .execute(&pool)
        .await
        .expect("submit complete draft for review");
        let review_updated_at: String = sqlx::query_scalar(
            "SELECT updated_at::TEXT FROM course_versions WHERE id = $1",
        )
        .bind(version_id)
        .fetch_one(&pool)
        .await
        .expect("read review token");
        let frozen = save_curriculum_draft(
            &pool,
            actor_id,
            version_id,
            &review_updated_at,
            &draft.to_string(),
        )
        .await;
        assert!(matches!(frozen, Err(DraftEditError::Conflict(_))));
        pool.close().await;
    }
}
