use crate::domain::EvaluatorEngine;
use crate::learning_activity;
use proto::ai_evaluator::ai_evaluator_service_server::AiEvaluatorService;
use proto::ai_evaluator::{
    DetectedWeakness, DrillExercise, EvaluateExamAnswerRequest, EvaluateExamAnswerResponse,
    EvaluateLearningActivityRequest, EvaluateLearningActivityResponse,
    GenerateTargetedDrillRequest, GenerateTargetedDrillResponse,
};
use sqlx::PgPool;
use tonic::{Request, Response, Status};
use uuid::Uuid;

#[derive(Clone)]
pub struct MyAIEvaluatorService {
    pool: PgPool,
}

impl MyAIEvaluatorService {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    async fn find_existing_activity_result(
        &self,
        user_id: Uuid,
        idempotency_key: Uuid,
    ) -> Result<Option<(serde_json::Value, serde_json::Value, serde_json::Value)>, Box<Status>>
    {
        let mut transaction = self.pool.begin().await.map_err(|error| {
            tracing::error!(error = %error, "Could not open assessment idempotency transaction");
            Box::new(Status::unavailable(
                "Assessment storage is temporarily unavailable",
            ))
        })?;
        common::set_current_user_id(&mut transaction, user_id)
            .await
            .map_err(|error| {
                tracing::error!(error = %error, "Could not establish assessment RLS context");
                Box::new(Status::internal(
                    "Could not establish assessment data isolation",
                ))
            })?;
        let existing =
            sqlx::query_as::<_, (serde_json::Value, serde_json::Value, serde_json::Value)>(
                "SELECT activity_definition_json, submission_json, result_json
             FROM activity_attempt_results
             WHERE user_id = $1 AND idempotency_key = $2",
            )
            .bind(user_id)
            .bind(idempotency_key)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|error| {
                tracing::error!(error = %error, "Could not read idempotent activity result");
                Box::new(Status::internal(
                    "Could not read the saved assessment result",
                ))
            })?;
        transaction.commit().await.map_err(|error| {
            tracing::error!(error = %error, "Could not close assessment idempotency transaction");
            Box::new(Status::internal(
                "Could not close assessment data transaction",
            ))
        })?;
        Ok(existing)
    }
}

#[tonic::async_trait]
impl AiEvaluatorService for MyAIEvaluatorService {
    async fn evaluate_exam_answer(
        &self,
        request: Request<EvaluateExamAnswerRequest>,
    ) -> Result<Response<EvaluateExamAnswerResponse>, Status> {
        common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();

        let metrics = EvaluatorEngine::evaluate_response_async(
            &req.user_text_response,
            &req.question_id,
            &req.target_level,
        )
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let total_score = metrics.calculate_total_score();
        let passed = metrics.is_passed();
        let weaknesses = metrics.detect_weaknesses();

        let mut detected_weaknesses: Vec<DetectedWeakness> = weaknesses
            .into_iter()
            .map(|(skill, score)| DetectedWeakness {
                skill: skill.to_string(),
                score,
                tip: format!(
                    "Reforzar ejercicios específicos de {} en contexto conversacional.",
                    skill
                ),
            })
            .collect();

        if let Some(phonetic) = metrics.phonetic_correction {
            if let Some(first) = detected_weaknesses.first_mut() {
                first.tip = format!("🔊 Corrección fonética: {} | {}", phonetic, first.tip);
            }
        }

        Ok(Response::new(EvaluateExamAnswerResponse {
            score_listening: metrics.listening.value(),
            score_pronunciation: metrics.pronunciation.value(),
            score_fluency: metrics.fluency.value(),
            score_vocabulary: metrics.vocabulary.value(),
            score_grammar: metrics.grammar.value(),
            score_conversation: metrics.conversation.value(),
            total_score,
            passed,
            detected_weaknesses,
        }))
    }

    async fn evaluate_learning_activity(
        &self,
        request: Request<EvaluateLearningActivityRequest>,
    ) -> Result<Response<EvaluateLearningActivityResponse>, Status> {
        common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();

        if req.activity_definition_json.len() > 512 * 1024 || req.submission_json.len() > 256 * 1024
        {
            return Err(Status::resource_exhausted(
                "Activity definition or submission exceeds the allowed size",
            ));
        }

        let user_id = Uuid::parse_str(&req.user_id)
            .map_err(|_| Status::invalid_argument("user_id must be a valid UUID"))?;
        let activity: common::activity_contract::ActivityDefinition =
            serde_json::from_str(&req.activity_definition_json)
                .map_err(|_| Status::invalid_argument("activity definition JSON is invalid"))?;
        let submission: common::activity_contract::ActivitySubmission =
            serde_json::from_str(&req.submission_json)
                .map_err(|_| Status::invalid_argument("activity submission JSON is invalid"))?;

        activity.validate().map_err(|error| match error {
            error @ common::activity_contract::ActivityContractError::UnsupportedSchemaVersion => {
                Status::failed_precondition(error.to_string())
            }
            _ => Status::invalid_argument(format!("activity definition rejected: {error}")),
        })?;
        activity
            .validate_submission(&submission)
            .map_err(|error| {
                match error {
                error @ (common::activity_contract::ActivityContractError::ActivityVersionMismatch
                | common::activity_contract::ActivityContractError::UnsupportedSchemaVersion) => {
                    Status::failed_precondition(error.to_string())
                }
                _ => Status::invalid_argument(format!("activity submission rejected: {error}")),
            }
            })?;

        let activity_json = serde_json::to_value(&activity)
            .map_err(|_| Status::internal("Could not encode validated activity definition"))?;
        let submission_json = serde_json::to_value(&submission)
            .map_err(|_| Status::internal("Could not encode validated activity submission"))?;

        if let Some((stored_activity, stored_submission, stored_result)) = self
            .find_existing_activity_result(user_id, submission.idempotency_key)
            .await
            .map_err(|status| *status)?
        {
            if stored_activity != activity_json || stored_submission != submission_json {
                return Err(Status::already_exists(
                    "Idempotency key was already used with a different activity or answer",
                ));
            }
            return Ok(Response::new(EvaluateLearningActivityResponse {
                result_json: serde_json::to_string(&stored_result).map_err(|_| {
                    Status::internal("Could not encode the saved assessment result")
                })?,
                idempotent_replay: true,
            }));
        }

        let result = learning_activity::evaluate(&activity, &submission)
            .await
            .map_err(|error| match error {
                learning_activity::EvaluationFailure::Invalid(message) => {
                    Status::invalid_argument(message)
                }
                learning_activity::EvaluationFailure::Provider(message) => {
                    tracing::warn!(
                        activity_id = %activity.activity_id,
                        activity_version = activity.activity_version,
                        error = %message,
                        "Learning activity assessment provider failed"
                    );
                    Status::unavailable("The assessment provider is temporarily unavailable")
                }
            })?;
        result
            .validate()
            .map_err(|error| Status::internal(format!("Evaluation result rejected: {error}")))?;

        let result_json = serde_json::to_value(&result)
            .map_err(|_| Status::internal("Could not encode the assessment result"))?;
        let (rubric_code, rubric_version) = match &activity.evaluation {
            common::activity_contract::EvaluationPolicy::Rubric {
                rubric_code,
                rubric_version,
                ..
            } => (Some(rubric_code.clone()), Some(i64::from(*rubric_version))),
            _ => (None, None),
        };

        let mut transaction = self.pool.begin().await.map_err(|error| {
            tracing::error!(error = %error, "Could not open assessment result transaction");
            Status::unavailable("Assessment storage is temporarily unavailable")
        })?;
        common::set_current_user_id(&mut transaction, user_id)
            .await
            .map_err(|error| {
                tracing::error!(error = %error, "Could not establish assessment RLS context");
                Status::internal("Could not establish assessment data isolation")
            })?;

        let inserted = sqlx::query_scalar::<_, serde_json::Value>(
            "INSERT INTO activity_attempt_results (
                attempt_id, user_id, activity_id, activity_version, idempotency_key,
                activity_definition_json, submission_json, result_json,
                evaluation_engine_version, rubric_code, rubric_version
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (user_id, idempotency_key) DO NOTHING
             RETURNING result_json",
        )
        .bind(result.attempt_id)
        .bind(user_id)
        .bind(activity.activity_id)
        .bind(i64::from(activity.activity_version))
        .bind(submission.idempotency_key)
        .bind(&activity_json)
        .bind(&submission_json)
        .bind(&result_json)
        .bind(learning_activity::evaluation_engine_version())
        .bind(rubric_code)
        .bind(rubric_version)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "Could not persist assessment result");
            Status::internal("Could not persist the assessment result")
        })?;

        let (saved_result, idempotent_replay) = match inserted {
            Some(saved) => (saved, false),
            None => {
                let existing = sqlx::query_as::<
                    _,
                    (serde_json::Value, serde_json::Value, serde_json::Value),
                >(
                    "SELECT activity_definition_json, submission_json, result_json
                     FROM activity_attempt_results
                     WHERE user_id = $1 AND idempotency_key = $2",
                )
                .bind(user_id)
                .bind(submission.idempotency_key)
                .fetch_one(&mut *transaction)
                .await
                .map_err(|error| {
                    tracing::error!(error = %error, "Could not resolve concurrent assessment retry");
                    Status::internal("Could not resolve the assessment retry")
                })?;
                if existing.0 != activity_json || existing.1 != submission_json {
                    return Err(Status::already_exists(
                        "Idempotency key was concurrently used with a different activity or answer",
                    ));
                }
                (existing.2, true)
            }
        };

        transaction.commit().await.map_err(|error| {
            tracing::error!(error = %error, "Could not commit assessment result");
            Status::internal("Could not commit the assessment result")
        })?;

        Ok(Response::new(EvaluateLearningActivityResponse {
            result_json: serde_json::to_string(&saved_result)
                .map_err(|_| Status::internal("Could not encode the assessment result"))?,
            idempotent_replay,
        }))
    }

    async fn generate_targeted_drill(
        &self,
        request: Request<GenerateTargetedDrillRequest>,
    ) -> Result<Response<GenerateTargetedDrillResponse>, Status> {
        common::ensure_authenticated_user(&request, &request.get_ref().user_id)?;
        let req = request.into_inner();

        let exercises = vec![
            DrillExercise {
                title: "Dril 1: Entonación Fonética en Microservicios".to_string(),
                english_text: "We refactored the monolith into microservices to decrease latency."
                    .to_string(),
                spanish_phonetic:
                    "Güi rifáktord da mónolith íntu máikroservises tu dikrís léitensi.".to_string(),
                target_skill: req
                    .weak_skills
                    .first()
                    .cloned()
                    .unwrap_or_else(|| "Pronunciación".to_string()),
            },
            DrillExercise {
                title: "Dril 2: Suavización de Verbos en Pasado".to_string(),
                english_text: "I finished the authentication feature yesterday.".to_string(),
                spanish_phonetic: "Ai fínisht di otentikéishon fíchur yésterdei.".to_string(),
                target_skill: req
                    .weak_skills
                    .get(1)
                    .cloned()
                    .unwrap_or_else(|| "Gramática".to_string()),
            },
        ];

        Ok(Response::new(GenerateTargetedDrillResponse {
            drill_id: format!("drill-{}", req.user_id),
            duration_minutes: 20,
            exercises,
        }))
    }
}
