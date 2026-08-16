use aws_sdk_bedrockruntime::{
    config::Region,
    types::{ContentBlock, ConversationRole, Message},
    Client as BedrockClient,
};
use common::{DomainError, ScoreMetric};
use serde::{Deserialize, Serialize};
use std::env;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExamMetrics {
    pub listening: ScoreMetric,
    pub pronunciation: ScoreMetric,
    pub fluency: ScoreMetric,
    pub vocabulary: ScoreMetric,
    pub conversation: ScoreMetric,
    pub grammar: ScoreMetric,
    /// Corrección fonética en español natural generada por Claude
    pub phonetic_correction: Option<String>,
}

impl ExamMetrics {
    /// Calcula el puntaje global ponderado de las 6 métricas:
    /// Total = 20% Listening + 20% Pronunciación + 20% Fluidez + 15% Vocabulario + 15% Conversación + 10% Gramática
    pub fn calculate_total_score(&self) -> f32 {
        (0.20 * self.listening.value())
            + (0.20 * self.pronunciation.value())
            + (0.20 * self.fluency.value())
            + (0.15 * self.vocabulary.value())
            + (0.15 * self.conversation.value())
            + (0.10 * self.grammar.value())
    }

    pub fn is_passed(&self) -> bool {
        self.calculate_total_score() >= 90.0
    }

    /// Aísla las 2 métricas más débiles para el generador de rutinas quirúrgicas de 20 minutos
    pub fn detect_weaknesses(&self) -> Vec<(&'static str, f32)> {
        let mut list = vec![
            ("Listening", self.listening.value()),
            ("Pronunciación", self.pronunciation.value()),
            ("Fluidez", self.fluency.value()),
            ("Vocabulario", self.vocabulary.value()),
            ("Conversación", self.conversation.value()),
            ("Gramática", self.grammar.value()),
        ];
        list.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
        list.into_iter().take(2).collect()
    }
}

/// JSON esperado de Claude 3.5 Sonnet
#[derive(Deserialize)]
struct BedrockEvalResponse {
    listening: f32,
    pronunciation: f32,
    fluency: f32,
    vocabulary: f32,
    grammar: f32,
    conversation: f32,
    phonetic_correction: Option<String>,
}

pub struct EvaluatorEngine;

impl EvaluatorEngine {
    /// Evalúa la respuesta del estudiante llamando a AWS Bedrock.
    /// Retorna directamente el resultado de Bedrock o un error si la llamada falla.
    pub async fn evaluate_response_async(
        user_text: &str,
        question: &str,
        _target_level: &str,
    ) -> Result<ExamMetrics, DomainError> {
        Self::call_bedrock(user_text, question)
            .await
            .map_err(|e| DomainError::ExternalServiceError(format!("AWS Bedrock error: {}", e)))
    }

    /// Llamada real a AWS Bedrock Runtime usando el modelo de texto configurado
    async fn call_bedrock(
        user_text: &str,
        question: &str,
    ) -> Result<ExamMetrics, Box<dyn std::error::Error + Send + Sync>> {
        let region = Region::new(
            env::var("AWS_REGION").unwrap_or_else(|_| "us-east-1".to_string()),
        );
        let sdk_config = aws_config::defaults(aws_config::BehaviorVersion::latest())
            .region(region)
            .load()
            .await;

        let client = BedrockClient::new(&sdk_config);

        // Modelo de texto de evaluación desde .env (AWS_BEDROCK_TEXT_EVAL_MODEL_ID o AWS_BEDROCK_MODEL_ID)
        let model_id = env::var("AWS_BEDROCK_TEXT_EVAL_MODEL_ID")
            .or_else(|_| env::var("AWS_BEDROCK_MODEL_ID"))
            .unwrap_or_else(|_| "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string());

        let prompt = format!(
            r#"Eres un evaluador experto en inglés técnico para desarrolladores hispanohablantes. \
Tu misión es evaluar la respuesta de un estudiante a una pregunta de entrevista técnica en inglés. \
Debes responder ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown, sin explicaciones.

Pregunta del reclutador: "{question}"
Respuesta del estudiante: "{user_text}"

Evalúa en escala del 0 al 100 estas 6 métricas (contexto: el texto fue dictado por el estudiante):
- listening: ¿Respondió relevantemente a la pregunta? (comprensión auditiva simulada)
- pronunciation: ¿El texto sugiere buena pronunciación según las palabras usadas?
- fluency: ¿La respuesta fluye naturalmente sin pausas evidentes?
- vocabulary: ¿Usa vocabulario técnico apropiado?
- grammar: ¿La gramática es correcta?
- conversation: ¿Es una respuesta conversacional y natural?

También incluye:
- phonetic_correction: UNA oración clave de la respuesta con fonética en español natural \
  (ej: "Aim divélopin sofgüer in rast."). Si no aplica, null.

Responde SOLO con este JSON exacto:
{{
  "listening": 85.0,
  "pronunciation": 78.0,
  "fluency": 82.0,
  "vocabulary": 90.0,
  "grammar": 88.0,
  "conversation": 87.0,
  "phonetic_correction": "Güi rifikáktord da monoliz into máikroservises."
}}"#
        );

        let message = Message::builder()
            .role(ConversationRole::User)
            .content(ContentBlock::Text(prompt))
            .build()
            .map_err(|e| format!("Message build error: {}", e))?;

        let response = client
            .converse()
            .model_id(&model_id)
            .messages(message)
            .send()
            .await?;

        // Extraer el texto de la respuesta de Bedrock
        let response_text = response
            .output()
            .and_then(|o| o.as_message().ok())
            .and_then(|m| m.content().first())
            .and_then(|c| c.as_text().ok())
            .map(|s| s.to_string())
            .unwrap_or_default();

        println!("🤖 [Bedrock model={}] Respuesta: {}", model_id, &response_text[..response_text.len().min(200)]);

        // Parsear el JSON de Bedrock
        let eval: BedrockEvalResponse = serde_json::from_str(response_text.trim())
            .map_err(|e| format!("JSON parse error: {} | Response: {}", e, response_text))?;

        Ok(ExamMetrics {
            listening: ScoreMetric::new(eval.listening.clamp(0.0, 100.0))
                .map_err(|e| format!("ScoreMetric error: {}", e))?,
            pronunciation: ScoreMetric::new(eval.pronunciation.clamp(0.0, 100.0))
                .map_err(|e| format!("ScoreMetric error: {}", e))?,
            fluency: ScoreMetric::new(eval.fluency.clamp(0.0, 100.0))
                .map_err(|e| format!("ScoreMetric error: {}", e))?,
            vocabulary: ScoreMetric::new(eval.vocabulary.clamp(0.0, 100.0))
                .map_err(|e| format!("ScoreMetric error: {}", e))?,
            conversation: ScoreMetric::new(eval.conversation.clamp(0.0, 100.0))
                .map_err(|e| format!("ScoreMetric error: {}", e))?,
            grammar: ScoreMetric::new(eval.grammar.clamp(0.0, 100.0))
                .map_err(|e| format!("ScoreMetric error: {}", e))?,
            phonetic_correction: eval.phonetic_correction,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_exam_metrics_calculation_and_pass_target() {
        let metrics = ExamMetrics {
            listening: ScoreMetric::new(95.0).unwrap(),
            pronunciation: ScoreMetric::new(90.0).unwrap(),
            fluency: ScoreMetric::new(92.0).unwrap(),
            vocabulary: ScoreMetric::new(90.0).unwrap(),
            conversation: ScoreMetric::new(91.0).unwrap(),
            grammar: ScoreMetric::new(88.0).unwrap(),
            phonetic_correction: None,
        };

        let total = metrics.calculate_total_score();
        // 0.20*95 + 0.20*90 + 0.20*92 + 0.15*90 + 0.15*91 + 0.10*88 = 91.35
        assert!(total >= 90.0);
        assert!(metrics.is_passed());
    }

    #[test]
    fn test_weakness_detection_isolates_lowest_two() {
        let metrics = ExamMetrics {
            listening: ScoreMetric::new(94.0).unwrap(),
            pronunciation: ScoreMetric::new(82.0).unwrap(), // Weak 1
            fluency: ScoreMetric::new(88.0).unwrap(),
            vocabulary: ScoreMetric::new(92.0).unwrap(),
            conversation: ScoreMetric::new(89.0).unwrap(),
            grammar: ScoreMetric::new(81.0).unwrap(), // Weak 2
            phonetic_correction: None,
        };

        let weaknesses = metrics.detect_weaknesses();
        assert_eq!(weaknesses.len(), 2);
        assert_eq!(weaknesses[0].0, "Gramática");
        assert_eq!(weaknesses[1].0, "Pronunciación");
    }
}
