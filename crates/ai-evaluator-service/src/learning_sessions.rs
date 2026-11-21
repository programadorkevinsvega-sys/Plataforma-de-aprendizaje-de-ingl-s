//! Durable, user-isolated lesson sessions.
//!
//! Private activity definitions are loaded from the published curriculum. The BFF
//! receives them only over the internal gRPC boundary; HTTP responses use the
//! StudentActivityView projection. Submission reservations make provider retries
//! safe without holding database locks while Bedrock evaluates written work.

use common::activity_contract::ActivityAttemptResult;
use common::activity_contract::{ActivityDefinition, ActivitySubmission, AttemptState};
use proto::ai_evaluator::LessonSessionSnapshot;
use serde_json::Value;
use sha2::{Digest, Sha256};
use sqlx::{PgPool, Postgres, Transaction};
use tonic::Status;
use uuid::Uuid;

const MAX_SUBMISSION_BYTES: usize = 256 * 1024;
const MAX_SESSION_ACTIVE_DURATION_MS: i64 = 12 * 60 * 60 * 1000;

#[derive(Debug, Clone)]
pub struct BeginAttempt {
    pub reservation_id: String,
    pub activity_definition_json: String,
    pub existing_result_json: String,
    pub idempotent_replay: bool,
}

#[derive(Debug, Clone)]
pub struct CommitAttempt {
    pub result_json: String,
    pub session: LessonSessionSnapshot,
    pub idempotent_replay: bool,
}

fn db_unavailable(error: impl std::fmt::Display, operation: &'static str) -> Status {
    tracing::error!(%error, operation, "Lesson session database operation failed");
    Status::unavailable("El servicio de sesiones no está disponible temporalmente")
}

async fn set_user(tx: &mut Transaction<'_, Postgres>, user_id: Uuid) -> Result<(), Status> {
    common::set_current_user_id(tx, user_id)
        .await
        .map_err(|error| {
            tracing::error!(%error, user_id = %user_id, "Could not establish lesson session RLS context");
            Status::internal("No se pudo establecer el aislamiento de la sesión")
        })
}

fn decode_activity(
    raw: Value,
    expected_sha256: &str,
    course_version_id: Uuid,
    lesson_id: Uuid,
) -> Result<ActivityDefinition, Status> {
    let canonical_bytes = serde_json::to_vec(&raw).map_err(|error| {
        tracing::error!(%error, "Published activity JSON could not be normalized");
        Status::data_loss("No se pudo normalizar una actividad publicada")
    })?;
    let actual_sha256 = Sha256::digest(&canonical_bytes)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual_sha256 != expected_sha256.trim() {
        tracing::error!(
            activity_sha256 = %actual_sha256,
            expected_sha256 = %expected_sha256.trim(),
            "Published activity content digest mismatch"
        );
        return Err(Status::data_loss(
            "La huella de integridad de la actividad no coincide",
        ));
    }

    let activity: ActivityDefinition = serde_json::from_value(raw).map_err(|error| {
        tracing::error!(%error, "Published lesson activity could not be decoded");
        Status::data_loss("Una actividad publicada tiene un contrato inválido")
    })?;
    activity.validate().map_err(|error| {
        tracing::error!(%error, activity_id = %activity.activity_id, "Published lesson activity failed validation");
        Status::data_loss("Una actividad publicada no supera la validación de integridad")
    })?;
    if activity.course_version_id != course_version_id || activity.lesson_id != lesson_id {
        tracing::error!(
            activity_id = %activity.activity_id,
            course_version_id = %course_version_id,
            lesson_id = %lesson_id,
            "Published lesson activity has inconsistent curriculum identity"
        );
        return Err(Status::data_loss(
            "La actividad no pertenece a esta versión de lección",
        ));
    }
    Ok(activity)
}

async fn session_snapshot_in_transaction(
    tx: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<LessonSessionSnapshot, Status> {
    let row: Option<(Uuid, Uuid, Uuid, String, i32, i32, i64, String, String)> = sqlx::query_as(
        r#"SELECT session.lesson_id,
                  session.course_version_id,
                  session.id,
                  session.status,
                  session.current_activity_position,
                  session.total_activity_count,
                  session.active_duration_ms,
                  COALESCE(session.completed_at::TEXT, ''),
                  lesson.title
             FROM lesson_sessions session
             JOIN course_lessons lesson
               ON lesson.id = session.lesson_id
              AND lesson.course_version_id = session.course_version_id
            WHERE session.id = $1
              AND session.user_id = $2"#,
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| db_unavailable(error, "load_session_snapshot"))?;
    let (
        lesson_id,
        course_version_id,
        id,
        status,
        position,
        total,
        active_duration_ms,
        completed_at,
        lesson_title,
    ) = row.ok_or_else(|| Status::not_found("No se encontró la sesión de aprendizaje"))?;

    let mut student_activity_json = String::new();
    let mut activity_definition_json = String::new();
    let mut remaining_attempts = 0_i32;
    let mut pending_reservation_id = String::new();
    let mut pending_submission_json = String::new();
    if status == "in_progress" && position <= total {
        let definition: Option<(Value, String)> = sqlx::query_as(
            r#"SELECT definition_json, definition_sha256
                 FROM curriculum_lesson_activities
                WHERE lesson_id = $1
                  AND course_version_id = $2
                  AND position = $3"#,
        )
        .bind(lesson_id)
        .bind(course_version_id)
        .bind(position)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|error| db_unavailable(error, "load_current_activity"))?;
        let (raw, definition_sha256) = definition.ok_or_else(|| {
            tracing::error!(session_id = %id, position, "Session points to a missing published activity");
            Status::data_loss("La sesión apunta a una actividad publicada inexistente")
        })?;
        let activity = decode_activity(&raw, &definition_sha256, course_version_id, lesson_id)?;
        let view = activity.to_student_view();
        student_activity_json = serde_json::to_string(&view)
            .map_err(|_| Status::internal("No se pudo preparar la actividad para el estudiante"))?;
        activity_definition_json = serde_json::to_string(&activity)
            .map_err(|_| Status::internal("No se pudo preparar la actividad privada"))?;

        let pending: Option<(Uuid, Value)> = sqlx::query_as(
            r#"SELECT reservation_id, submission_json
                 FROM lesson_session_activity_attempts
                WHERE session_id = $1
                  AND user_id = $2
                  AND activity_id = $3
                  AND state = 'processing'
                ORDER BY created_at DESC, reservation_id DESC
                LIMIT 1"#,
        )
        .bind(id)
        .bind(user_id)
        .bind(activity.activity_id)
        .fetch_optional(&mut **tx)
        .await
        .map_err(|error| db_unavailable(error, "load_pending_activity_attempt"))?;
        if let Some((reservation_id, submission)) = pending {
            pending_reservation_id = reservation_id.to_string();
            pending_submission_json = serde_json::to_string(&submission)
                .map_err(|_| Status::internal("No se pudo preparar el envío reservado"))?;
        }

        let attempts: i64 = sqlx::query_scalar(
            r#"SELECT COUNT(*)
                 FROM lesson_session_activity_attempts
                WHERE session_id = $1 AND activity_id = $2"#,
        )
        .bind(id)
        .bind(activity.activity_id)
        .fetch_one(&mut **tx)
        .await
        .map_err(|error| db_unavailable(error, "count_activity_attempts"))?;
        remaining_attempts = (i64::from(activity.limits.max_attempts) - attempts)
            .max(0)
            .min(i64::from(i32::MAX)) as i32;
    }

    let last_result: Option<Value> = sqlx::query_scalar(
        r#"SELECT result_json
             FROM lesson_session_activity_attempts
            WHERE session_id = $1
              AND user_id = $2
              AND result_json IS NOT NULL
            ORDER BY created_at DESC, reservation_id DESC
            LIMIT 1"#,
    )
    .bind(id)
    .bind(user_id)
    .fetch_optional(&mut **tx)
    .await
    .map_err(|error| db_unavailable(error, "load_last_session_result"))?;
    let last_result_json = last_result
        .map(|value| serde_json::to_string(&value))
        .transpose()
        .map_err(|_| Status::internal("No se pudo serializar el último resultado"))?
        .unwrap_or_default();

    Ok(LessonSessionSnapshot {
        session_id: id.to_string(),
        lesson_id: lesson_id.to_string(),
        lesson_title,
        course_version_id: course_version_id.to_string(),
        status,
        current_activity_position: position,
        total_activities: total,
        active_duration_ms,
        student_activity_json,
        activity_definition_json,
        last_result_json,
        completed_at,
        remaining_attempts,
        pending_reservation_id,
        pending_submission_json,
    })
}

pub async fn start_lesson_session(
    pool: &PgPool,
    user_id: Uuid,
    lesson_id: Uuid,
    idempotency_key: Uuid,
) -> Result<(LessonSessionSnapshot, bool), Status> {
    if lesson_id.is_nil() || idempotency_key.is_nil() {
        return Err(Status::invalid_argument(
            "lessonId e idempotencyKey deben ser UUID no nulos",
        ));
    }

    let mut tx = pool
        .begin()
        .await
        .map_err(|error| db_unavailable(error, "start_session"))?;
    set_user(&mut tx, user_id).await?;
    let lock_key = format!("lesson-session:{user_id}:{lesson_id}");
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(lock_key)
        .execute(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "lock_lesson_session_start"))?;

    if let Some((existing_session_id, existing_lesson_id)) = sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT id, lesson_id FROM lesson_sessions WHERE user_id = $1 AND start_idempotency_key = $2",
    )
    .bind(user_id)
    .bind(idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "resolve_start_idempotency"))?
    {
        if existing_lesson_id != lesson_id {
            return Err(Status::already_exists("La clave de inicio ya se utilizó para otra lección"));
        }
        let snapshot = session_snapshot_in_transaction(&mut tx, user_id, existing_session_id).await?;
        tx.commit().await.map_err(|error| db_unavailable(error, "commit_start_replay"))?;
        return Ok((snapshot, true));
    }

    let enrollment: Option<(Uuid, Uuid, String)> = sqlx::query_as(
        r#"SELECT enrollment.id, lesson.course_version_id, lesson.title
             FROM course_lessons lesson
             JOIN course_versions version
               ON version.id = lesson.course_version_id
             JOIN course_enrollments enrollment
               ON enrollment.course_version_id = version.id
              AND enrollment.user_id = $2
              AND enrollment.status = 'active'
            WHERE lesson.id = $1
              AND version.status = 'published'"#,
    )
    .bind(lesson_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "authorize_lesson_session"))?;
    let (enrollment_id, course_version_id, _lesson_title) = enrollment.ok_or_else(|| {
        Status::failed_precondition("La lección no está publicada o no existe una matrícula activa")
    })?;

    if let Some(existing_session_id) = sqlx::query_scalar::<_, Uuid>(
        r#"SELECT id
             FROM lesson_sessions
            WHERE user_id = $1
              AND lesson_id = $2
              AND status IN ('in_progress', 'pending_review')
            ORDER BY last_activity_at DESC, id DESC
            LIMIT 1
            FOR UPDATE"#,
    )
    .bind(user_id)
    .bind(lesson_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "find_resumable_lesson_session"))?
    {
        let snapshot =
            session_snapshot_in_transaction(&mut tx, user_id, existing_session_id).await?;
        tx.commit()
            .await
            .map_err(|error| db_unavailable(error, "commit_resumed_lesson_session"))?;
        return Ok((snapshot, true));
    }

    let blocked_prerequisite: bool = sqlx::query_scalar(
        r#"SELECT EXISTS (
               SELECT 1
                 FROM lesson_prerequisites prerequisite
                WHERE prerequisite.lesson_id = $1
                  AND NOT EXISTS (
                      SELECT 1
                        FROM course_lesson_progress_events evidence
                       WHERE evidence.user_id = $2
                         AND evidence.lesson_id = prerequisite.prerequisite_lesson_id
                         AND (
                             (prerequisite.required_state = 'completed'
                                 AND evidence.outcome_status IN ('completed', 'mastered'))
                             OR
                             (prerequisite.required_state = 'mastered'
                                 AND evidence.outcome_status = 'mastered'
                                 AND evidence.mastery_score >= prerequisite.minimum_mastery_score)
                         )
                  )
           )"#,
    )
    .bind(lesson_id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "check_lesson_prerequisites"))?;
    if blocked_prerequisite {
        return Err(Status::failed_precondition(
            "Debes completar los prerrequisitos de esta lección antes de iniciarla",
        ));
    }

    let total_activities: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM curriculum_lesson_activities WHERE lesson_id = $1 AND course_version_id = $2",
    )
    .bind(lesson_id)
    .bind(course_version_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "count_published_activities"))?;
    if total_activities <= 0 || total_activities > 200 {
        return Err(Status::failed_precondition(
            "La lección todavía no tiene actividades publicadas disponibles",
        ));
    }

    let session_id: Option<Uuid> = sqlx::query_scalar(
        r#"INSERT INTO lesson_sessions (
               user_id, enrollment_id, course_version_id, lesson_id,
               start_idempotency_key, total_activity_count
           )
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id, start_idempotency_key) DO NOTHING
           RETURNING id"#,
    )
    .bind(user_id)
    .bind(enrollment_id)
    .bind(course_version_id)
    .bind(lesson_id)
    .bind(idempotency_key)
    .bind(total_activities as i32)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "create_lesson_session"))?;

    let (session_id, resumed_existing) = if let Some(id) = session_id {
        (id, false)
    } else {
        let existing: Option<(Uuid, Uuid)> = sqlx::query_as(
            "SELECT id, lesson_id FROM lesson_sessions WHERE user_id = $1 AND start_idempotency_key = $2",
        )
        .bind(user_id)
        .bind(idempotency_key)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "resolve_concurrent_start"))?;
        let (id, existing_lesson_id) = existing
            .ok_or_else(|| Status::internal("No se pudo resolver el inicio idempotente"))?;
        if existing_lesson_id != lesson_id {
            return Err(Status::already_exists(
                "La clave de inicio ya se utilizó para otra lección",
            ));
        }
        (id, true)
    };

    let snapshot = session_snapshot_in_transaction(&mut tx, user_id, session_id).await?;
    tx.commit()
        .await
        .map_err(|error| db_unavailable(error, "commit_lesson_session"))?;
    Ok((snapshot, resumed_existing))
}

pub async fn get_lesson_session(
    pool: &PgPool,
    user_id: Uuid,
    session_id: Uuid,
) -> Result<LessonSessionSnapshot, Status> {
    if session_id.is_nil() {
        return Err(Status::invalid_argument("sessionId no puede ser nulo"));
    }
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| db_unavailable(error, "get_session"))?;
    set_user(&mut tx, user_id).await?;
    let snapshot = session_snapshot_in_transaction(&mut tx, user_id, session_id).await?;
    tx.commit()
        .await
        .map_err(|error| db_unavailable(error, "commit_get_session"))?;
    Ok(snapshot)
}

pub async fn begin_lesson_activity_attempt(
    pool: &PgPool,
    user_id: Uuid,
    session_id: Uuid,
    submission_raw: &str,
) -> Result<BeginAttempt, Status> {
    if session_id.is_nil() || submission_raw.len() > MAX_SUBMISSION_BYTES {
        return Err(Status::resource_exhausted(
            "La sesión o el envío supera los límites permitidos",
        ));
    }
    let submission: ActivitySubmission = serde_json::from_str(submission_raw)
        .map_err(|_| Status::invalid_argument("El envío de actividad no contiene JSON válido"))?;
    if submission.idempotency_key.is_nil() {
        return Err(Status::invalid_argument("idempotencyKey no puede ser nula"));
    }
    let submission_json = serde_json::to_value(&submission)
        .map_err(|_| Status::internal("No se pudo normalizar el envío"))?;

    let mut tx = pool
        .begin()
        .await
        .map_err(|error| db_unavailable(error, "begin_activity_attempt"))?;
    set_user(&mut tx, user_id).await?;

    // Serialize attempts per session. Idempotency lookup deliberately precedes
    // the active-state check so a completed submission can always be replayed.
    let session: Option<(Uuid, Uuid, String, i32)> = sqlx::query_as(
        r#"SELECT course_version_id, lesson_id, status, current_activity_position
             FROM lesson_sessions
            WHERE id = $1 AND user_id = $2
            FOR UPDATE"#,
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "lock_lesson_session"))?;
    let (course_version_id, lesson_id, session_status, position) =
        session.ok_or_else(|| Status::not_found("No se encontró la sesión de aprendizaje"))?;

    if let Some((
        existing_reservation,
        existing_session_id,
        existing_activity_id,
        existing_submission,
        existing_result,
        existing_state,
    )) = sqlx::query_as::<_, (Uuid, Uuid, Uuid, Value, Option<Value>, String)>(
        r#"SELECT reservation_id, session_id, activity_id, submission_json, result_json, state
                 FROM lesson_session_activity_attempts
                WHERE user_id = $1 AND idempotency_key = $2"#,
    )
    .bind(user_id)
    .bind(submission.idempotency_key)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "resolve_attempt_idempotency"))?
    {
        if existing_session_id != session_id || existing_submission != submission_json {
            return Err(Status::already_exists(
                "La clave idempotente ya se utilizó con otro envío",
            ));
        }
        let existing_definition: (Value, String) = sqlx::query_as(
            r#"SELECT definition_json, definition_sha256
                 FROM curriculum_lesson_activities
                WHERE activity_id = $1
                  AND course_version_id = $2
                  AND lesson_id = $3"#,
        )
        .bind(existing_activity_id)
        .bind(course_version_id)
        .bind(lesson_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "load_replayed_activity_definition"))?
        .ok_or_else(|| Status::data_loss("La actividad del intento idempotente ya no existe"))?;
        let replay_activity = decode_activity(
            &existing_definition.0,
            &existing_definition.1,
            course_version_id,
            lesson_id,
        )?;
        replay_activity
            .validate_submission(&submission)
            .map_err(|_| {
                Status::already_exists(
                    "La clave idempotente no coincide con la actividad reservada",
                )
            })?;
        let activity_json = serde_json::to_string(&replay_activity)
            .map_err(|_| Status::internal("No se pudo serializar la definición privada"))?;
        let existing_result_json = existing_result
            .map(|value| serde_json::to_string(&value))
            .transpose()
            .map_err(|_| Status::internal("No se pudo serializar el resultado almacenado"))?
            .unwrap_or_default();
        let idempotent_replay = existing_state != "processing";
        tx.commit()
            .await
            .map_err(|error| db_unavailable(error, "commit_attempt_replay"))?;
        return Ok(BeginAttempt {
            reservation_id: existing_reservation.to_string(),
            activity_definition_json: activity_json,
            existing_result_json,
            idempotent_replay,
        });
    }

    if session_status != "in_progress" {
        return Err(Status::failed_precondition(
            "La sesión ya no admite nuevas respuestas",
        ));
    }

    let current_activity: Option<(Value, String)> = sqlx::query_as(
        r#"SELECT definition_json, definition_sha256
             FROM curriculum_lesson_activities
            WHERE lesson_id = $1
              AND course_version_id = $2
              AND position = $3"#,
    )
    .bind(lesson_id)
    .bind(course_version_id)
    .bind(position)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "load_activity_for_submission"))?;
    let (raw_definition, definition_sha256) = current_activity
        .ok_or_else(|| Status::data_loss("La posición actual no tiene actividad publicada"))?;
    let activity = decode_activity(
        &raw_definition,
        &definition_sha256,
        course_version_id,
        lesson_id,
    )?;
    activity
        .validate_submission(&submission)
        .map_err(|error| match error {
            common::activity_contract::ActivityContractError::ActivityVersionMismatch
            | common::activity_contract::ActivityContractError::UnsupportedSchemaVersion => {
                Status::failed_precondition(error.to_string())
            }
            _ => Status::invalid_argument(format!(
                "El envío no cumple el contrato publicado: {error}"
            )),
        })?;

    // Spoken submissions must reference a server-issued, durably stored audio
    // object. The current repository has no such upload ledger/object store yet;
    // reject client-invented UUIDs rather than recording unauditable evidence.
    if activity.modality == common::activity_contract::ActivityModality::Spoken {
        return Err(Status::failed_precondition(
            "La carga segura de evidencia de audio todavía no está habilitada para esta actividad",
        ));
    }

    let attempts: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lesson_session_activity_attempts WHERE session_id = $1 AND activity_id = $2",
    )
    .bind(session_id)
    .bind(activity.activity_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "count_session_attempts"))?;
    if attempts >= i64::from(activity.limits.max_attempts) {
        return Err(Status::resource_exhausted(
            "Se alcanzó el máximo de intentos de esta actividad",
        ));
    }

    if let Some(time_limit_seconds) = activity.limits.time_limit_seconds {
        let expired: bool = sqlx::query_scalar(
            r#"SELECT CURRENT_TIMESTAMP >
                      current_activity_started_at + ($2::INTEGER * INTERVAL '1 second')
                 FROM lesson_sessions
                WHERE id = $1 AND user_id = $3"#,
        )
        .bind(session_id)
        .bind(i32::try_from(time_limit_seconds).unwrap_or(i32::MAX))
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "check_activity_time_limit"))?;
        if expired {
            return Err(Status::deadline_exceeded(
                "Se agotó el tiempo de esta actividad",
            ));
        }
    }

    let reservation_id = Uuid::new_v4();
    let attempt_number = i32::try_from(attempts + 1)
        .map_err(|_| Status::resource_exhausted("Se alcanzó el máximo de intentos"))?;
    sqlx::query(
        r#"INSERT INTO lesson_session_activity_attempts (
               reservation_id, session_id, user_id, course_version_id, lesson_id,
               activity_id, activity_version, attempt_number, idempotency_key, submission_json
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"#,
    )
    .bind(reservation_id)
    .bind(session_id)
    .bind(user_id)
    .bind(course_version_id)
    .bind(lesson_id)
    .bind(activity.activity_id)
    .bind(
        i32::try_from(activity.activity_version)
            .map_err(|_| Status::failed_precondition("Versión de actividad inválida"))?,
    )
    .bind(attempt_number)
    .bind(submission.idempotency_key)
    .bind(&submission_json)
    .execute(&mut *tx)
    .await
    .map_err(|error| {
        if error
            .to_string()
            .contains("uq_lesson_session_one_processing_attempt")
        {
            Status::aborted("Ya hay un envío de esta actividad en proceso")
        } else {
            db_unavailable(error, "reserve_activity_attempt")
        }
    })?;

    let activity_definition_json = serde_json::to_string(&activity)
        .map_err(|_| Status::internal("No se pudo serializar la actividad privada"))?;
    tx.commit()
        .await
        .map_err(|error| db_unavailable(error, "commit_activity_reservation"))?;
    Ok(BeginAttempt {
        reservation_id: reservation_id.to_string(),
        activity_definition_json,
        existing_result_json: String::new(),
        idempotent_replay: false,
    })
}

pub async fn commit_lesson_activity_attempt(
    pool: &PgPool,
    user_id: Uuid,
    session_id: Uuid,
    reservation_id: Uuid,
) -> Result<CommitAttempt, Status> {
    if session_id.is_nil() || reservation_id.is_nil() {
        return Err(Status::invalid_argument(
            "sessionId y reservationId deben ser UUID no nulos",
        ));
    }
    let mut tx = pool
        .begin()
        .await
        .map_err(|error| db_unavailable(error, "commit_activity_attempt"))?;
    set_user(&mut tx, user_id).await?;
    // Keep one lock order across begin/commit (session first, attempt second).
    let locked_session: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM lesson_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "lock_session_before_commit"))?;
    if locked_session.is_none() {
        return Err(Status::not_found("No se encontró la sesión de aprendizaje"));
    }
    let reservation: Option<(String, Uuid, Uuid, Uuid, Option<Uuid>, i32, i32, Value, Option<Value>, Uuid)> =
        sqlx::query_as(
            r#"SELECT attempt.state, attempt.activity_id, attempt.course_version_id,
                      attempt.lesson_id, attempt.assessment_attempt_id,
                      session.current_activity_position, attempt.attempt_number,
                      attempt.submission_json, attempt.result_json, attempt.idempotency_key
                 FROM lesson_session_activity_attempts attempt
                 JOIN lesson_sessions session ON session.id = attempt.session_id AND session.user_id = attempt.user_id
                WHERE attempt.reservation_id = $1
                  AND attempt.session_id = $2
                  AND attempt.user_id = $3
                FOR UPDATE OF attempt"#,
        )
        .bind(reservation_id)
        .bind(session_id)
        .bind(user_id)
        .fetch_optional(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "lock_activity_reservation"))?;
    let (
        state,
        activity_id,
        course_version_id,
        lesson_id,
        _prior_assessment_attempt_id,
        current_position,
        attempt_number,
        submission_json,
        stored_result,
        idempotency_key,
    ) = reservation.ok_or_else(|| Status::not_found("No se encontró la reserva del envío"))?;

    if state != "processing" {
        let result = stored_result
            .ok_or_else(|| Status::data_loss("La reserva finalizada no contiene resultado"))?;
        let result_json = serde_json::to_string(&result)
            .map_err(|_| Status::internal("No se pudo serializar el resultado guardado"))?;
        let session = session_snapshot_in_transaction(&mut tx, user_id, session_id).await?;
        tx.commit()
            .await
            .map_err(|error| db_unavailable(error, "commit_attempt_idempotent_replay"))?;
        return Ok(CommitAttempt {
            result_json,
            session,
            idempotent_replay: true,
        });
    }

    let saved: Option<(Uuid, Value, Value, Value)> = sqlx::query_as(
        r#"SELECT result.attempt_id,
                  result.activity_definition_json,
                  result.submission_json,
                  result.result_json
             FROM activity_attempt_results result
            WHERE result.user_id = $1
              AND result.idempotency_key = $2
              AND result.activity_id = $3
              AND result.activity_version = (
                  SELECT activity.activity_version
                    FROM curriculum_lesson_activities activity
                   WHERE activity.activity_id = $3 AND activity.course_version_id = $4
              )"#,
    )
    .bind(user_id)
    .bind(idempotency_key)
    .bind(activity_id)
    .bind(course_version_id)
    .fetch_optional(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "verify_persisted_assessment"))?;
    let (attempt_id, private_definition, persisted_submission, result_json) =
        saved.ok_or_else(|| {
            Status::failed_precondition(
                "El evaluador todavía no confirmó el resultado de este envío",
            )
        })?;

    if persisted_submission != submission_json {
        return Err(Status::already_exists(
            "El resultado persistido no corresponde al envío reservado",
        ));
    }
    let expected_definition: (Value, String) = sqlx::query_as(
        "SELECT definition_json, definition_sha256 FROM curriculum_lesson_activities WHERE activity_id = $1 AND course_version_id = $2",
    )
    .bind(activity_id)
    .bind(course_version_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "verify_published_activity"))?;
    if private_definition != expected_definition.0 {
        return Err(Status::failed_precondition(
            "La evaluación no utilizó la definición publicada de esta actividad",
        ));
    }

    let parsed_result: ActivityAttemptResult = serde_json::from_value(result_json.clone())
        .map_err(|_| Status::data_loss("El evaluador persistió un resultado inválido"))?;
    parsed_result.validate().map_err(|error| {
        tracing::error!(%error, "Stored assessment result failed contract validation");
        Status::data_loss("El evaluador persistió un resultado inconsistente")
    })?;
    if parsed_result.attempt_id != attempt_id || parsed_result.activity_id != activity_id {
        return Err(Status::data_loss(
            "El identificador del resultado no coincide con el intento",
        ));
    }

    let activity_definition = decode_activity(
        expected_definition.0,
        &expected_definition.1,
        course_version_id,
        lesson_id,
    )?;
    if parsed_result.activity_version != activity_definition.activity_version {
        return Err(Status::data_loss(
            "La versión evaluada no coincide con la actividad publicada",
        ));
    }
    let should_retry_activity = parsed_result.state == AttemptState::Evaluated
        && parsed_result
            .score
            .as_ref()
            .is_some_and(|score| score.normalized_score < 100.0)
        && attempt_number < i32::from(activity_definition.limits.max_attempts);

    let status = match parsed_result.state {
        AttemptState::Evaluated => "evaluated",
        AttemptState::PendingReview => "pending_review",
        AttemptState::NotMeasured => "not_measured",
    };
    sqlx::query(
        r#"UPDATE lesson_session_activity_attempts
              SET state = $2,
                  result_json = $3,
                  assessment_attempt_id = $4,
                  completed_at = CURRENT_TIMESTAMP
            WHERE reservation_id = $1 AND state = 'processing'"#,
    )
    .bind(reservation_id)
    .bind(status)
    .bind(&result_json)
    .bind(attempt_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "finalize_activity_attempt"))?;

    if let Some(score) = parsed_result
        .score
        .as_ref()
        .filter(|_| parsed_result.state == AttemptState::Evaluated)
    {
        sqlx::query(
            r#"INSERT INTO activity_objective_evidence (
                   user_id, session_id, assessment_attempt_id, activity_id,
                   course_version_id, lesson_id, learning_objective_id, normalized_score
               )
               SELECT $1, $2, $3, link.activity_id, $4, $5, link.learning_objective_id, $6
                 FROM lesson_activity_objectives link
                 JOIN lesson_learning_objectives required
                   ON required.learning_objective_id = link.learning_objective_id
                  AND required.course_version_id = link.course_version_id
                  AND required.lesson_id = $5
                  AND required.is_required = TRUE
                WHERE link.activity_id = $7
                  AND link.course_version_id = $4
               ON CONFLICT (user_id, assessment_attempt_id, learning_objective_id) DO NOTHING"#,
        )
        .bind(user_id)
        .bind(session_id)
        .bind(attempt_id)
        .bind(course_version_id)
        .bind(lesson_id)
        .bind(score.normalized_score / 100.0)
        .bind(activity_id)
        .execute(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "persist_objective_evidence"))?;
    }

    let submission: ActivitySubmission = serde_json::from_value(submission_json)
        .map_err(|_| Status::data_loss("El envío reservado no cumple el contrato"))?;
    let session_state: String =
        sqlx::query_scalar("SELECT status FROM lesson_sessions WHERE id = $1 AND user_id = $2")
            .bind(session_id)
            .bind(user_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|error| db_unavailable(error, "load_session_status"))?;
    if session_state != "in_progress" {
        return Err(Status::failed_precondition(
            "La sesión dejó de estar activa antes de confirmar el intento",
        ));
    }

    let session_row: (i32, i32) = sqlx::query_as(
        "SELECT current_activity_position, total_activity_count FROM lesson_sessions WHERE id = $1 AND user_id = $2",
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "load_session_position"))?;
    if session_row.0 != current_position {
        return Err(Status::aborted(
            "La posición de la sesión cambió; vuelve a cargar la sesión",
        ));
    }

    let server_elapsed_ms: i64 = sqlx::query_scalar(
        r#"SELECT GREATEST(
               0,
               FLOOR(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - current_activity_started_at)) * 1000)::BIGINT
           )
             FROM lesson_sessions
            WHERE id = $1 AND user_id = $2"#,
    )
    .bind(session_id)
    .bind(user_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "measure_server_activity_duration"))?;
    let accepted_active_duration_ms = i64::try_from(submission.active_duration_ms)
        .unwrap_or(MAX_SESSION_ACTIVE_DURATION_MS)
        .min(server_elapsed_ms.saturating_add(5_000))
        .min(MAX_SESSION_ACTIVE_DURATION_MS);

    let next_position = if should_retry_activity {
        current_position
    } else {
        current_position.saturating_add(1)
    };
    let has_next = next_position <= session_row.1;
    let next_state = if should_retry_activity || has_next {
        "in_progress"
    } else {
        let pending: bool = sqlx::query_scalar(
            "SELECT EXISTS (SELECT 1 FROM lesson_session_activity_attempts WHERE session_id = $1 AND state = 'pending_review')",
        )
        .bind(session_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "check_pending_reviews"))?;
        if pending {
            "pending_review"
        } else {
            "completed"
        }
    };

    sqlx::query(
        r#"UPDATE lesson_sessions
              SET current_activity_position = $2,
                  status = $3,
                  active_duration_ms = LEAST(
                      active_duration_ms + $4::BIGINT,
                      $5::BIGINT
                  ),
                  current_activity_started_at = CURRENT_TIMESTAMP,
                  last_activity_at = CURRENT_TIMESTAMP,
                  completed_at = CASE WHEN $3 IN ('completed', 'pending_review')
                                      THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE id = $1 AND user_id = $6"#,
    )
    .bind(session_id)
    .bind(next_position)
    .bind(next_state)
    .bind(accepted_active_duration_ms)
    .bind(MAX_SESSION_ACTIVE_DURATION_MS)
    .bind(user_id)
    .execute(&mut *tx)
    .await
    .map_err(|error| db_unavailable(error, "advance_lesson_session"))?;

    if next_state == "completed" {
        let (required_objectives, evidenced_objectives, mastery_score): (i64, i64, f64) =
            sqlx::query_as(
                r#"SELECT
                       COUNT(*)::BIGINT,
                       COUNT(latest.learning_objective_id)::BIGINT,
                       COALESCE(AVG(latest.normalized_score)::DOUBLE PRECISION, 0.0)
                   FROM lesson_learning_objectives required
                   LEFT JOIN LATERAL (
                       SELECT evidence.learning_objective_id, evidence.normalized_score
                         FROM activity_objective_evidence evidence
                        WHERE evidence.session_id = $1
                          AND evidence.user_id = $2
                          AND evidence.learning_objective_id = required.learning_objective_id
                        ORDER BY evidence.recorded_at DESC, evidence.id DESC
                        LIMIT 1
                   ) latest ON TRUE
                  WHERE required.lesson_id = $3
                    AND required.is_required = TRUE"#,
            )
            .bind(session_id)
            .bind(user_id)
            .bind(lesson_id)
            .fetch_one(&mut *tx)
            .await
            .map_err(|error| db_unavailable(error, "calculate_lesson_mastery"))?;
        let outcome = if required_objectives > 0
            && evidenced_objectives == required_objectives
            && mastery_score >= 0.8
        {
            "mastered"
        } else {
            "completed"
        };
        let enrollment_id: Uuid = sqlx::query_scalar(
            "SELECT enrollment_id FROM lesson_sessions WHERE id = $1 AND user_id = $2",
        )
        .bind(session_id)
        .bind(user_id)
        .fetch_one(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "load_session_enrollment"))?;
        sqlx::query(
            r#"INSERT INTO course_lesson_progress_events (
                   user_id, enrollment_id, course_version_id, lesson_id, evidence_event_id,
                   outcome_status, mastery_score
               ) VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (user_id, evidence_event_id) DO NOTHING"#,
        )
        .bind(user_id)
        .bind(enrollment_id)
        .bind(course_version_id)
        .bind(lesson_id)
        .bind(session_id)
        .bind(outcome)
        .bind(mastery_score.clamp(0.0, 1.0))
        .execute(&mut *tx)
        .await
        .map_err(|error| db_unavailable(error, "record_lesson_completion_evidence"))?;
    }

    let snapshot = session_snapshot_in_transaction(&mut tx, user_id, session_id).await?;
    let result_json = serde_json::to_string(&result_json)
        .map_err(|_| Status::internal("No se pudo serializar el resultado confirmado"))?;
    tx.commit()
        .await
        .map_err(|error| db_unavailable(error, "commit_lesson_activity_attempt"))?;

    Ok(CommitAttempt {
        result_json,
        session: snapshot,
        idempotent_replay: false,
    })
}
