use crate::domain::EvaluatorEngine;
use proto::ai_evaluator::ai_evaluator_service_server::AiEvaluatorService;
use proto::ai_evaluator::{
    DetectedWeakness, DrillExercise, EvaluateExamAnswerRequest, EvaluateExamAnswerResponse,
    GenerateTargetedDrillRequest, GenerateTargetedDrillResponse,
};
use tonic::{Request, Response, Status};

#[derive(Default)]
pub struct MyAIEvaluatorService;

#[tonic::async_trait]
impl AiEvaluatorService for MyAIEvaluatorService {
    async fn evaluate_exam_answer(
        &self,
        request: Request<EvaluateExamAnswerRequest>,
    ) -> Result<Response<EvaluateExamAnswerResponse>, Status> {
        let req = request.into_inner();

        let metrics = EvaluatorEngine::evaluate_response_async(
            &req.user_text_response,
            &req.question_id, // pasamos el texto de la pregunta en question_id para contexto
            &req.target_level,
        )
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

        let total_score = metrics.calculate_total_score();
        let passed = metrics.is_passed();
        let weaknesses = metrics.detect_weaknesses();

        // Incluir la corrección fonética de Claude como un weakness tip especial
        let mut detected_weaknesses: Vec<DetectedWeakness> = weaknesses
            .into_iter()
            .map(|(skill, score)| DetectedWeakness {
                skill: skill.to_string(),
                score,
                tip: format!("Reforzar ejercicios específicos de {} en contexto conversacional.", skill),
            })
            .collect();

        // Si Claude generó una corrección fonética, adjuntarla como "tip" especial en el primer weakness
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

    async fn generate_targeted_drill(
        &self,
        request: Request<GenerateTargetedDrillRequest>,
    ) -> Result<Response<GenerateTargetedDrillResponse>, Status> {
        let req = request.into_inner();

        let exercises = vec![
            DrillExercise {
                title: "Dril 1: Entonación Fonética en Microservicios".to_string(),
                english_text: "We refactored the monolith into microservices to decrease latency.".to_string(),
                spanish_phonetic: "Güi rifáktord da mónolith íntu máikroservises tu dikrís léitensi.".to_string(),
                target_skill: req.weak_skills.first().cloned().unwrap_or_else(|| "Pronunciación".to_string()),
            },
            DrillExercise {
                title: "Dril 2: Suavización de Verbos en Pasado".to_string(),
                english_text: "I finished the authentication feature yesterday.".to_string(),
                spanish_phonetic: "Ai fínisht di otentikéishon fíchur yésterdei.".to_string(),
                target_skill: req.weak_skills.get(1).cloned().unwrap_or_else(|| "Gramática".to_string()),
            },
        ];

        Ok(Response::new(GenerateTargetedDrillResponse {
            drill_id: format!("drill-{}", req.user_id),
            duration_minutes: 20,
            exercises,
        }))
    }
}
