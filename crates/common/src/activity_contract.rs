//! Contratos versionados de actividades: definición privada, vista pública,
//! envío y resultado. Este módulo de dominio no contiene persistencia ni transporte.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use thiserror::Error;
use uuid::Uuid;

pub const ACTIVITY_SCHEMA_VERSION: &str = "1.0";
pub const MAX_ACTIVITY_HINTS: usize = 8;
pub const MAX_ACTIVITY_OPTIONS: usize = 8;
pub const MAX_ACTIVITY_QUESTIONS: usize = 20;
pub const MAX_ACTIVE_DURATION_MS: u64 = 12 * 60 * 60 * 1000;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum ActivityContractError {
    #[error("schemaVersion debe ser {ACTIVITY_SCHEMA_VERSION}")]
    UnsupportedSchemaVersion,
    #[error("activityId o activityVersion no coincide con la actividad publicada")]
    ActivityVersionMismatch,
    #[error("{0}")]
    Invalid(String),
}

fn require_text(value: &str, field: &str, max_chars: usize) -> Result<(), ActivityContractError> {
    if value.trim().is_empty() {
        return Err(ActivityContractError::Invalid(format!("{field} no puede estar vacío")));
    }
    if value.chars().count() > max_chars {
        return Err(ActivityContractError::Invalid(format!(
            "{field} supera el máximo de {max_chars} caracteres"
        )));
    }
    Ok(())
}

fn ensure_unique<T: Eq + std::hash::Hash>(
    values: impl IntoIterator<Item = T>,
    field: &str,
) -> Result<(), ActivityContractError> {
    let mut seen = HashSet::new();
    if values.into_iter().all(|value| seen.insert(value)) {
        Ok(())
    } else {
        Err(ActivityContractError::Invalid(format!(
            "{field} contiene identificadores duplicados"
        )))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TrackCode { General, Technology }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum CefrLevel {
    #[serde(rename = "PRE_A1")] PreA1,
    A1, A2, B1, B2, C1, C2,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LearningSkill {
    Vocabulary, Grammar, Listening, Reading, Writing, Speaking,
    Interaction, Mediation, Phonology,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityModality { Written, Spoken, Listening, Practice }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ActivityType {
    MultipleChoice, Translation, FillBlank, WordOrder, Matching,
    ListeningComprehension, Dictation, ReadingComprehension,
    GrammarTransformation, ErrorCorrection, OpenWriting,
    GuidedDialogue, VocabularyRecall,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptPolicy { Never, AfterSubmission }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ActivityStimulus {
    Text { text: String },
    Audio { asset_id: Uuid, transcript_policy: TranscriptPolicy },
    Image { asset_id: Uuid },
    TextAndAudio { text: String, audio_asset_id: Uuid, transcript_policy: TranscriptPolicy },
}

impl ActivityStimulus {
    fn has_audio(&self) -> bool {
        matches!(self, Self::Audio { .. } | Self::TextAndAudio { .. })
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ActivityDefinition {
    pub schema_version: String,
    pub activity_id: Uuid,
    pub activity_code: String,
    pub activity_version: u32,
    pub course_version_id: Uuid,
    pub lesson_id: Uuid,
    pub title: String,
    pub cefr_level: CefrLevel,
    pub track: TrackCode,
    pub modality: ActivityModality,
    pub skills: Vec<LearningSkill>,
    pub objective_ids: Vec<Uuid>,
    pub instructions: String,
    pub stimulus: Option<ActivityStimulus>,
    pub exercise: ExerciseSpec,
    pub hints: Vec<ActivityHint>,
    pub evaluation: EvaluationPolicy,
    pub feedback: FeedbackPolicy,
    pub limits: ActivityLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ActivityHint {
    pub hint_id: Uuid,
    pub order: u8,
    pub title: String,
    pub body: String,
    pub penalty_points: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum ExerciseSpec {
    MultipleChoice {
        prompt: String,
        options: Vec<ActivityOption>,
        correct_option_ids: Vec<Uuid>,
        allow_multiple: bool,
    },
    Translation {
        prompt: String,
        source_text: String,
        direction: TranslationDirection,
        accepted_answers: Vec<String>,
    },
    FillBlank { prompt_template: String, gaps: Vec<GapDefinition> },
    WordOrder { prompt: String, tokens: Vec<OrderedToken>, expected_token_order: Vec<Uuid> },
    Matching {
        prompt: String,
        left_items: Vec<MatchItem>,
        right_items: Vec<MatchItem>,
        correct_pairs: Vec<MatchPair>,
    },
    ListeningComprehension { prompt: String, questions: Vec<ChoiceQuestion> },
    Dictation { prompt: String, accepted_transcripts: Vec<String> },
    ReadingComprehension { passage: String, questions: Vec<ChoiceQuestion> },
    GrammarTransformation { prompt: String, source_sentence: String, accepted_answers: Vec<String> },
    ErrorCorrection { prompt: String, source_sentence: String, accepted_answers: Vec<String> },
    OpenWriting { prompt: String, min_words: u16, max_words: u16 },
    GuidedDialogue { scenario: String, opening_prompt: String, max_turns: u8 },
    VocabularyRecall {
        prompt: String,
        vocabulary_word_id: Uuid,
        direction: TranslationDirection,
        accepted_answers: Vec<String>,
    },
}

impl ExerciseSpec {
    pub fn activity_type(&self) -> ActivityType {
        match self {
            Self::MultipleChoice { .. } => ActivityType::MultipleChoice,
            Self::Translation { .. } => ActivityType::Translation,
            Self::FillBlank { .. } => ActivityType::FillBlank,
            Self::WordOrder { .. } => ActivityType::WordOrder,
            Self::Matching { .. } => ActivityType::Matching,
            Self::ListeningComprehension { .. } => ActivityType::ListeningComprehension,
            Self::Dictation { .. } => ActivityType::Dictation,
            Self::ReadingComprehension { .. } => ActivityType::ReadingComprehension,
            Self::GrammarTransformation { .. } => ActivityType::GrammarTransformation,
            Self::ErrorCorrection { .. } => ActivityType::ErrorCorrection,
            Self::OpenWriting { .. } => ActivityType::OpenWriting,
            Self::GuidedDialogue { .. } => ActivityType::GuidedDialogue,
            Self::VocabularyRecall { .. } => ActivityType::VocabularyRecall,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TranslationDirection { EnglishToSpanish, SpanishToEnglish }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ActivityOption { pub option_id: Uuid, pub text: String }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ChoiceQuestion {
    pub question_id: Uuid,
    pub prompt: String,
    pub options: Vec<ActivityOption>,
    pub correct_option_ids: Vec<Uuid>,
    pub allow_multiple: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GapDefinition { pub gap_id: Uuid, pub accepted_answers: Vec<String> }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct OrderedToken { pub token_id: Uuid, pub text: String }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MatchItem { pub item_id: Uuid, pub text: String }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct MatchPair { pub left_id: Uuid, pub right_id: Uuid }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PartialCreditPolicy { None, PerItem, Proportional }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TextNormalization {
    TrimWhitespace, CollapseWhitespace, CaseInsensitive, NormalizePunctuation, UnicodeNfc,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum EvaluationPolicy {
    Deterministic {
        max_points: u16,
        partial_credit: PartialCreditPolicy,
        text_normalization: Vec<TextNormalization>,
    },
    Rubric {
        rubric_code: String,
        rubric_version: u32,
        max_points: u16,
        criteria: Vec<RubricCriterion>,
    },
    UnscoredPractice,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RubricCriterion {
    pub criterion_code: String,
    pub description: String,
    pub skill: LearningSkill,
    pub max_points: u16,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FeedbackTiming { Immediate, AfterSubmission, AfterReview }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FeedbackPolicy {
    pub timing: FeedbackTiming,
    pub show_explanation: bool,
    pub reveal_correct_answer_after_submission: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ActivityLimits {
    pub time_limit_seconds: Option<u32>,
    pub max_attempts: u8,
    pub max_hints: u8,
    pub max_audio_duration_seconds: Option<u32>,
}

impl ActivityDefinition {
    pub fn validate(&self) -> Result<(), ActivityContractError> {
        if self.schema_version != ACTIVITY_SCHEMA_VERSION {
            return Err(ActivityContractError::UnsupportedSchemaVersion);
        }
        if self.activity_version == 0 {
            return Err(ActivityContractError::Invalid("activityVersion debe ser mayor que cero".into()));
        }
        if !(3..=80).contains(&self.activity_code.len())
            || !self.activity_code.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
        {
            return Err(ActivityContractError::Invalid(
                "activityCode debe ser estable y usar solo minúsculas, números, punto o guion".into()
            ));
        }
        require_text(&self.title, "title", 160)?;
        require_text(&self.instructions, "instructions", 2000)?;
        if self.skills.is_empty() || self.objective_ids.is_empty() {
            return Err(ActivityContractError::Invalid(
                "skills y objectiveIds deben contener al menos un elemento".into()
            ));
        }
        ensure_unique(self.skills.iter().copied(), "skills")?;
        ensure_unique(self.objective_ids.iter().copied(), "objectiveIds")?;
        self.validate_limits()?;
        self.validate_hints()?;
        self.validate_exercise()?;
        self.validate_modality()?;
        self.validate_evaluation()?;
        Ok(())
    }

    fn validate_limits(&self) -> Result<(), ActivityContractError> {
        if !(1..=10).contains(&self.limits.max_attempts) {
            return Err(ActivityContractError::Invalid("maxAttempts debe estar entre 1 y 10".into()));
        }
        if self.hints.len() > MAX_ACTIVITY_HINTS
            || self.limits.max_hints as usize > self.hints.len()
            || self.limits.max_hints as usize > MAX_ACTIVITY_HINTS
        {
            return Err(ActivityContractError::Invalid(
                "maxHints no puede superar las pistas disponibles ni el máximo de ocho".into()
            ));
        }
        if self.limits.time_limit_seconds.is_some_and(|n| !(5..=7200).contains(&n)) {
            return Err(ActivityContractError::Invalid("timeLimitSeconds debe estar entre 5 y 7200".into()));
        }
        if self.limits.max_audio_duration_seconds.is_some_and(|n| !(1..=600).contains(&n)) {
            return Err(ActivityContractError::Invalid("maxAudioDurationSeconds debe estar entre 1 y 600".into()));
        }
        if self.modality == ActivityModality::Spoken && self.limits.max_audio_duration_seconds.is_none() {
            return Err(ActivityContractError::Invalid("spoken requiere límite máximo de duración de audio".into()));
        }
        Ok(())
    }

    fn validate_hints(&self) -> Result<(), ActivityContractError> {
        if self.hints.len() > MAX_ACTIVITY_HINTS {
            return Err(ActivityContractError::Invalid("máximo ocho pistas por actividad".into()));
        }
        ensure_unique(self.hints.iter().map(|h| h.hint_id), "hints.hintId")?;
        ensure_unique(self.hints.iter().map(|h| h.order), "hints.order")?;
        for hint in &self.hints {
            if hint.order == 0 {
                return Err(ActivityContractError::Invalid("hints.order comienza en uno".into()));
            }
            require_text(&hint.title, "hints.title", 100)?;
            require_text(&hint.body, "hints.body", 1000)?;
        }
        Ok(())
    }

    fn validate_exercise(&self) -> Result<(), ActivityContractError> {
        match &self.exercise {
            ExerciseSpec::MultipleChoice { prompt, options, correct_option_ids, allow_multiple } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                validate_options(options, correct_option_ids, *allow_multiple)?;
            }
            ExerciseSpec::Translation { prompt, source_text, accepted_answers, .. } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                require_text(source_text, "exercise.sourceText", 1000)?;
                validate_accepted_answers(accepted_answers, "exercise.acceptedAnswers")?;
            }
            ExerciseSpec::FillBlank { prompt_template, gaps } => {
                require_text(prompt_template, "exercise.promptTemplate", 2000)?;
                if gaps.is_empty() || gaps.len() > 20 {
                    return Err(ActivityContractError::Invalid("fill_blank requiere de 1 a 20 espacios".into()));
                }
                ensure_unique(gaps.iter().map(|g| g.gap_id), "gaps.gapId")?;
                for gap in gaps {
                    let marker = format!("{{{{{}}}}}", gap.gap_id);
                    if prompt_template.matches(&marker).count() != 1 {
                        return Err(ActivityContractError::Invalid(format!("{marker} debe aparecer exactamente una vez")));
                    }
                    validate_accepted_answers(&gap.accepted_answers, "gaps.acceptedAnswers")?;
                }
            }
            ExerciseSpec::WordOrder { prompt, tokens, expected_token_order } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                if !(2..=30).contains(&tokens.len()) {
                    return Err(ActivityContractError::Invalid("word_order requiere de 2 a 30 tokens".into()));
                }
                ensure_unique(tokens.iter().map(|t| t.token_id), "tokens.tokenId")?;
                ensure_unique(expected_token_order.iter().copied(), "expectedTokenOrder")?;
                let ids: HashSet<_> = tokens.iter().map(|t| t.token_id).collect();
                if ids.len() != expected_token_order.len() || expected_token_order.iter().any(|id| !ids.contains(id)) {
                    return Err(ActivityContractError::Invalid("expectedTokenOrder debe usar todos los tokens una vez".into()));
                }
                for token in tokens { require_text(&token.text, "tokens.text", 80)?; }
            }
            ExerciseSpec::Matching { prompt, left_items, right_items, correct_pairs } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                if !(2..=20).contains(&left_items.len()) || !(2..=20).contains(&right_items.len()) {
                    return Err(ActivityContractError::Invalid("matching requiere de 2 a 20 elementos por lado".into()));
                }
                ensure_unique(left_items.iter().map(|i| i.item_id), "leftItems.itemId")?;
                ensure_unique(right_items.iter().map(|i| i.item_id), "rightItems.itemId")?;
                ensure_unique(correct_pairs.iter().map(|p| p.left_id), "correctPairs.leftId")?;
                ensure_unique(correct_pairs.iter().map(|p| p.right_id), "correctPairs.rightId")?;
                let left: HashSet<_> = left_items.iter().map(|i| i.item_id).collect();
                let right: HashSet<_> = right_items.iter().map(|i| i.item_id).collect();
                if correct_pairs.len() != left.len() || correct_pairs.iter().any(|p| !left.contains(&p.left_id) || !right.contains(&p.right_id)) {
                    return Err(ActivityContractError::Invalid("correctPairs debe vincular cada elemento izquierdo con uno derecho válido".into()));
                }
                for item in left_items.iter().chain(right_items.iter()) { require_text(&item.text, "matchItems.text", 240)?; }
            }
            ExerciseSpec::ListeningComprehension { prompt, questions } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                validate_questions(questions)?;
            }
            ExerciseSpec::Dictation { prompt, accepted_transcripts } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                validate_accepted_answers(accepted_transcripts, "acceptedTranscripts")?;
            }
            ExerciseSpec::ReadingComprehension { passage, questions } => {
                require_text(passage, "exercise.passage", 12000)?;
                validate_questions(questions)?;
            }
            ExerciseSpec::GrammarTransformation { prompt, source_sentence, accepted_answers }
            | ExerciseSpec::ErrorCorrection { prompt, source_sentence, accepted_answers } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                require_text(source_sentence, "exercise.sourceSentence", 1000)?;
                validate_accepted_answers(accepted_answers, "acceptedAnswers")?;
            }
            ExerciseSpec::OpenWriting { prompt, min_words, max_words } => {
                require_text(prompt, "exercise.prompt", 2000)?;
                if *min_words == 0 || max_words < min_words || *max_words > 1500 {
                    return Err(ActivityContractError::Invalid("open_writing requiere minWords > 0 y maxWords <= 1500".into()));
                }
            }
            ExerciseSpec::GuidedDialogue { scenario, opening_prompt, max_turns } => {
                require_text(scenario, "exercise.scenario", 2000)?;
                require_text(opening_prompt, "exercise.openingPrompt", 1000)?;
                if !(2..=20).contains(max_turns) {
                    return Err(ActivityContractError::Invalid("guided_dialogue.maxTurns debe estar entre 2 y 20".into()));
                }
            }
            ExerciseSpec::VocabularyRecall { prompt, accepted_answers, .. } => {
                require_text(prompt, "exercise.prompt", 1000)?;
                validate_accepted_answers(accepted_answers, "acceptedAnswers")?;
            }
        }
        Ok(())
    }

    fn validate_modality(&self) -> Result<(), ActivityContractError> {
        let exercise_type = self.exercise.activity_type();
        let has_skill = |skill| self.skills.contains(&skill);
        let has_audio = self.stimulus.as_ref().is_some_and(ActivityStimulus::has_audio);

        match self.modality {
            ActivityModality::Listening => {
                if !matches!(exercise_type, ActivityType::ListeningComprehension | ActivityType::Dictation)
                    || !has_skill(LearningSkill::Listening)
                    || !matches!(self.stimulus.as_ref(), Some(ActivityStimulus::Audio { .. }))
                {
                    return Err(ActivityContractError::Invalid(
                        "listening requiere comprensión/dictado, skill listening y audio sin transcript visible".into()
                    ));
                }
            }
            ActivityModality::Spoken => {
                if exercise_type != ActivityType::GuidedDialogue
                    || !has_skill(LearningSkill::Speaking)
                    || !matches!(self.evaluation, EvaluationPolicy::Rubric { .. })
                    || self.limits.max_audio_duration_seconds.is_none()
                {
                    return Err(ActivityContractError::Invalid(
                        "spoken requiere guided_dialogue, skill speaking, rúbrica y límite de audio".into()
                    ));
                }
            }
            ActivityModality::Written => {
                if matches!(exercise_type, ActivityType::ListeningComprehension | ActivityType::Dictation
                    | ActivityType::GuidedDialogue | ActivityType::VocabularyRecall)
                    || has_skill(LearningSkill::Speaking) || has_skill(LearningSkill::Listening)
                {
                    return Err(ActivityContractError::Invalid(
                        "written no puede medir speaking/listening ni usar tipos de ejercicio incompatibles".into()
                    ));
                }
            }
            ActivityModality::Practice => {
                if exercise_type != ActivityType::VocabularyRecall
                    || !matches!(self.evaluation, EvaluationPolicy::UnscoredPractice)
                {
                    return Err(ActivityContractError::Invalid(
                        "practice se reserva para vocabulary_recall sin puntuación académica".into()
                    ));
                }
            }
        }

        if matches!(exercise_type, ActivityType::ListeningComprehension | ActivityType::Dictation) && !has_audio {
            return Err(ActivityContractError::Invalid("listening y dictation requieren un asset de audio real".into()));
        }
        if exercise_type == ActivityType::OpenWriting
            && (!has_skill(LearningSkill::Writing) || !matches!(self.evaluation, EvaluationPolicy::Rubric { .. }))
        {
            return Err(ActivityContractError::Invalid("open_writing requiere skill writing y rúbrica versionada".into()));
        }
        Ok(())
    }

    fn validate_evaluation(&self) -> Result<(), ActivityContractError> {
        match &self.evaluation {
            EvaluationPolicy::Deterministic { max_points, .. } => {
                if *max_points == 0 {
                    return Err(ActivityContractError::Invalid("maxPoints debe ser mayor que cero".into()));
                }
            }
            EvaluationPolicy::Rubric { rubric_code, rubric_version, max_points, criteria } => {
                require_text(rubric_code, "rubricCode", 80)?;
                if *rubric_version == 0 || *max_points == 0 || criteria.is_empty() {
                    return Err(ActivityContractError::Invalid("rúbrica requiere versión, puntos y criterios".into()));
                }
                ensure_unique(criteria.iter().map(|c| c.criterion_code.as_str()), "criteria.criterionCode")?;
                let sum: u32 = criteria.iter().map(|c| c.max_points as u32).sum();
                if sum != *max_points as u32 {
                    return Err(ActivityContractError::Invalid("la suma de criterios debe coincidir con maxPoints".into()));
                }
                for criterion in criteria {
                    require_text(&criterion.criterion_code, "criterionCode", 80)?;
                    require_text(&criterion.description, "criterionDescription", 500)?;
                    if criterion.max_points == 0 || !self.skills.contains(&criterion.skill) {
                        return Err(ActivityContractError::Invalid("cada criterio requiere puntos positivos y una skill de la actividad".into()));
                    }
                }
            }
            EvaluationPolicy::UnscoredPractice => {
                if self.modality != ActivityModality::Practice {
                    return Err(ActivityContractError::Invalid("UnscoredPractice solo aplica a practice".into()));
                }
            }
        }
        Ok(())
    }

    pub fn to_student_view(&self) -> StudentActivityView {
        StudentActivityView {
            schema_version: self.schema_version.clone(),
            activity_id: self.activity_id,
            activity_version: self.activity_version,
            title: self.title.clone(),
            cefr_level: self.cefr_level,
            modality: self.modality,
            skills: self.skills.clone(),
            instructions: self.instructions.clone(),
            stimulus: self.stimulus.as_ref().map(StudentStimulus::from),
            exercise: StudentExercise::from(&self.exercise),
            available_hints: self.hints.iter().take(self.limits.max_hints as usize)
                .map(|h| StudentHintPreview { hint_id: h.hint_id, order: h.order, title: h.title.clone() })
                .collect(),
            limits: self.limits.clone(),
        }
    }

    pub fn validate_submission(&self, submission: &ActivitySubmission) -> Result<(), ActivityContractError> {
        if submission.schema_version != ACTIVITY_SCHEMA_VERSION {
            return Err(ActivityContractError::UnsupportedSchemaVersion);
        }
        if submission.activity_id != self.activity_id || submission.activity_version != self.activity_version {
            return Err(ActivityContractError::ActivityVersionMismatch);
        }
        if submission.active_duration_ms == 0 || submission.active_duration_ms > MAX_ACTIVE_DURATION_MS {
            return Err(ActivityContractError::Invalid("activeDurationMs debe estar entre 1 ms y 12 horas".into()));
        }
        if self.limits.time_limit_seconds.is_some_and(|s| submission.active_duration_ms > s as u64 * 1000) {
            return Err(ActivityContractError::Invalid("la respuesta supera el límite de tiempo".into()));
        }
        ensure_unique(submission.hints_used.iter().copied(), "hintsUsed")?;
        if submission.hints_used.len() > self.limits.max_hints as usize {
            return Err(ActivityContractError::Invalid("se usaron más pistas que las permitidas".into()));
        }
        let allowed: HashSet<_> = self.hints.iter().take(self.limits.max_hints as usize).map(|h| h.hint_id).collect();
        if submission.hints_used.iter().any(|id| !allowed.contains(id)) {
            return Err(ActivityContractError::Invalid("hintsUsed contiene una pista no disponible".into()));
        }
        validate_answer(&self.exercise, &self.limits, &submission.answer)
    }
}

fn validate_options(options: &[ActivityOption], correct: &[Uuid], allow_multiple: bool) -> Result<(), ActivityContractError> {
    if !(2..=MAX_ACTIVITY_OPTIONS).contains(&options.len()) {
        return Err(ActivityContractError::Invalid(format!("una pregunta requiere de 2 a {MAX_ACTIVITY_OPTIONS} opciones")));
    }
    ensure_unique(options.iter().map(|o| o.option_id), "options.optionId")?;
    ensure_unique(correct.iter().copied(), "correctOptionIds")?;
    let ids: HashSet<_> = options.iter().map(|o| o.option_id).collect();
    if correct.is_empty() || correct.iter().any(|id| !ids.contains(id)) || (!allow_multiple && correct.len() != 1) {
        return Err(ActivityContractError::Invalid("correctOptionIds no coincide con las opciones o allowMultiple".into()));
    }
    for option in options { require_text(&option.text, "option.text", 500)?; }
    Ok(())
}

fn validate_questions(questions: &[ChoiceQuestion]) -> Result<(), ActivityContractError> {
    if questions.is_empty() || questions.len() > MAX_ACTIVITY_QUESTIONS {
        return Err(ActivityContractError::Invalid(format!("se requieren de 1 a {MAX_ACTIVITY_QUESTIONS} preguntas")));
    }
    ensure_unique(questions.iter().map(|q| q.question_id), "questions.questionId")?;
    for q in questions {
        require_text(&q.prompt, "question.prompt", 1000)?;
        validate_options(&q.options, &q.correct_option_ids, q.allow_multiple)?;
    }
    Ok(())
}

fn validate_accepted_answers(answers: &[String], field: &str) -> Result<(), ActivityContractError> {
    if answers.is_empty() || answers.len() > 20 {
        return Err(ActivityContractError::Invalid(format!("{field} debe contener de 1 a 20 respuestas aceptadas")));
    }
    for answer in answers { require_text(answer, field, 500)?; }
    Ok(())
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StudentActivityView {
    pub schema_version: String,
    pub activity_id: Uuid,
    pub activity_version: u32,
    pub title: String,
    pub cefr_level: CefrLevel,
    pub modality: ActivityModality,
    pub skills: Vec<LearningSkill>,
    pub instructions: String,
    pub stimulus: Option<StudentStimulus>,
    pub exercise: StudentExercise,
    pub available_hints: Vec<StudentHintPreview>,
    pub limits: ActivityLimits,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum StudentStimulus {
    Text { text: String },
    Audio { asset_id: Uuid },
    Image { asset_id: Uuid },
    TextAndAudio { text: String, audio_asset_id: Uuid },
}

impl From<&ActivityStimulus> for StudentStimulus {
    fn from(v: &ActivityStimulus) -> Self {
        match v {
            ActivityStimulus::Text { text } => Self::Text { text: text.clone() },
            ActivityStimulus::Audio { asset_id, .. } => Self::Audio { asset_id: *asset_id },
            ActivityStimulus::Image { asset_id } => Self::Image { asset_id: *asset_id },
            ActivityStimulus::TextAndAudio { text, audio_asset_id, .. } =>
                Self::TextAndAudio { text: text.clone(), audio_asset_id: *audio_asset_id },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StudentHintPreview { pub hint_id: Uuid, pub order: u8, pub title: String }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum StudentExercise {
    MultipleChoice { prompt: String, options: Vec<ActivityOption>, allow_multiple: bool },
    Translation { prompt: String, source_text: String, direction: TranslationDirection },
    FillBlank { prompt_template: String, gap_ids: Vec<Uuid> },
    WordOrder { prompt: String, tokens: Vec<OrderedToken> },
    Matching { prompt: String, left_items: Vec<MatchItem>, right_items: Vec<MatchItem> },
    ListeningComprehension { prompt: String, questions: Vec<StudentChoiceQuestion> },
    Dictation { prompt: String },
    ReadingComprehension { passage: String, questions: Vec<StudentChoiceQuestion> },
    GrammarTransformation { prompt: String, source_sentence: String },
    ErrorCorrection { prompt: String, source_sentence: String },
    OpenWriting { prompt: String, min_words: u16, max_words: u16 },
    GuidedDialogue { scenario: String, opening_prompt: String, max_turns: u8 },
    VocabularyRecall { prompt: String, vocabulary_word_id: Uuid, direction: TranslationDirection },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct StudentChoiceQuestion {
    pub question_id: Uuid,
    pub prompt: String,
    pub options: Vec<ActivityOption>,
    pub allow_multiple: bool,
}

impl From<&ChoiceQuestion> for StudentChoiceQuestion {
    fn from(q: &ChoiceQuestion) -> Self {
        Self { question_id: q.question_id, prompt: q.prompt.clone(), options: q.options.clone(), allow_multiple: q.allow_multiple }
    }
}

impl From<&ExerciseSpec> for StudentExercise {
    fn from(v: &ExerciseSpec) -> Self {
        match v {
            ExerciseSpec::MultipleChoice { prompt, options, allow_multiple, .. } =>
                Self::MultipleChoice { prompt: prompt.clone(), options: options.clone(), allow_multiple: *allow_multiple },
            ExerciseSpec::Translation { prompt, source_text, direction, .. } =>
                Self::Translation { prompt: prompt.clone(), source_text: source_text.clone(), direction: *direction },
            ExerciseSpec::FillBlank { prompt_template, gaps } =>
                Self::FillBlank { prompt_template: prompt_template.clone(), gap_ids: gaps.iter().map(|g| g.gap_id).collect() },
            ExerciseSpec::WordOrder { prompt, tokens, .. } => Self::WordOrder { prompt: prompt.clone(), tokens: tokens.clone() },
            ExerciseSpec::Matching { prompt, left_items, right_items, .. } =>
                Self::Matching { prompt: prompt.clone(), left_items: left_items.clone(), right_items: right_items.clone() },
            ExerciseSpec::ListeningComprehension { prompt, questions } =>
                Self::ListeningComprehension { prompt: prompt.clone(), questions: questions.iter().map(StudentChoiceQuestion::from).collect() },
            ExerciseSpec::Dictation { prompt, .. } => Self::Dictation { prompt: prompt.clone() },
            ExerciseSpec::ReadingComprehension { passage, questions } =>
                Self::ReadingComprehension { passage: passage.clone(), questions: questions.iter().map(StudentChoiceQuestion::from).collect() },
            ExerciseSpec::GrammarTransformation { prompt, source_sentence, .. } =>
                Self::GrammarTransformation { prompt: prompt.clone(), source_sentence: source_sentence.clone() },
            ExerciseSpec::ErrorCorrection { prompt, source_sentence, .. } =>
                Self::ErrorCorrection { prompt: prompt.clone(), source_sentence: source_sentence.clone() },
            ExerciseSpec::OpenWriting { prompt, min_words, max_words } =>
                Self::OpenWriting { prompt: prompt.clone(), min_words: *min_words, max_words: *max_words },
            ExerciseSpec::GuidedDialogue { scenario, opening_prompt, max_turns } =>
                Self::GuidedDialogue { scenario: scenario.clone(), opening_prompt: opening_prompt.clone(), max_turns: *max_turns },
            ExerciseSpec::VocabularyRecall { prompt, vocabulary_word_id, direction, .. } =>
                Self::VocabularyRecall { prompt: prompt.clone(), vocabulary_word_id: *vocabulary_word_id, direction: *direction },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ActivitySubmission {
    pub schema_version: String,
    pub activity_id: Uuid,
    pub activity_version: u32,
    pub idempotency_key: Uuid,
    pub answer: StudentAnswer,
    pub hints_used: Vec<Uuid>,
    pub active_duration_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum StudentAnswer {
    SelectedOptions { option_ids: Vec<Uuid> },
    Text { value: String },
    GapAnswers { answers: Vec<GapAnswer> },
    OrderedTokens { token_ids: Vec<Uuid> },
    Matching { pairs: Vec<MatchPair> },
    QuestionChoices { answers: Vec<QuestionChoiceAnswer> },
    SpokenAudio { audio_upload_id: Uuid, audio_duration_ms: u32, transcript: Option<String> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct GapAnswer { pub gap_id: Uuid, pub value: String }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct QuestionChoiceAnswer { pub question_id: Uuid, pub option_ids: Vec<Uuid> }

fn validate_answer(exercise: &ExerciseSpec, limits: &ActivityLimits, answer: &StudentAnswer) -> Result<(), ActivityContractError> {
    match (exercise, answer) {
        (ExerciseSpec::MultipleChoice { options, allow_multiple, .. }, StudentAnswer::SelectedOptions { option_ids }) =>
            validate_selected_options(options, *allow_multiple, option_ids),
        (ExerciseSpec::Translation { .. } | ExerciseSpec::Dictation { .. }
            | ExerciseSpec::GrammarTransformation { .. } | ExerciseSpec::ErrorCorrection { .. }
            | ExerciseSpec::VocabularyRecall { .. }, StudentAnswer::Text { value }) =>
            require_text(value, "answer.value", 5000),
        (ExerciseSpec::FillBlank { gaps, .. }, StudentAnswer::GapAnswers { answers }) => {
            ensure_unique(answers.iter().map(|a| a.gap_id), "answers.gapId")?;
            let allowed: HashSet<_> = gaps.iter().map(|g| g.gap_id).collect();
            if answers.len() > gaps.len() || answers.iter().any(|a| !allowed.contains(&a.gap_id)) {
                return Err(ActivityContractError::Invalid("gapAnswers contiene un espacio desconocido o repetido".into()));
            }
            for answer in answers {
                if answer.value.chars().count() > 500 {
                    return Err(ActivityContractError::Invalid("cada respuesta admite hasta 500 caracteres".into()));
                }
            }
            Ok(())
        }
        (ExerciseSpec::WordOrder { tokens, .. }, StudentAnswer::OrderedTokens { token_ids }) => {
            ensure_unique(token_ids.iter().copied(), "tokenIds")?;
            let allowed: HashSet<_> = tokens.iter().map(|t| t.token_id).collect();
            if token_ids.len() != allowed.len() || token_ids.iter().any(|id| !allowed.contains(id)) {
                return Err(ActivityContractError::Invalid("orderedTokens debe contener todos los tokens exactamente una vez".into()));
            }
            Ok(())
        }
        (ExerciseSpec::Matching { left_items, right_items, .. }, StudentAnswer::Matching { pairs }) => {
            ensure_unique(pairs.iter().map(|p| p.left_id), "pairs.leftId")?;
            ensure_unique(pairs.iter().map(|p| p.right_id), "pairs.rightId")?;
            let left: HashSet<_> = left_items.iter().map(|i| i.item_id).collect();
            let right: HashSet<_> = right_items.iter().map(|i| i.item_id).collect();
            if pairs.len() > left.len() || pairs.iter().any(|p| !left.contains(&p.left_id) || !right.contains(&p.right_id)) {
                return Err(ActivityContractError::Invalid("matching contiene elementos desconocidos o demasiadas parejas".into()));
            }
            Ok(())
        }
        (ExerciseSpec::ListeningComprehension { questions, .. } | ExerciseSpec::ReadingComprehension { questions, .. },
            StudentAnswer::QuestionChoices { answers }) => {
            ensure_unique(answers.iter().map(|a| a.question_id), "answers.questionId")?;
            let map: std::collections::HashMap<_, _> = questions.iter().map(|q| (q.question_id, q)).collect();
            if answers.len() > questions.len() {
                return Err(ActivityContractError::Invalid("hay más respuestas que preguntas".into()));
            }
            for answer in answers {
                let question = map.get(&answer.question_id)
                    .ok_or_else(|| ActivityContractError::Invalid("questionId no pertenece a la actividad".into()))?;
                validate_selected_options(&question.options, question.allow_multiple, &answer.option_ids)?;
            }
            Ok(())
        }
        (ExerciseSpec::OpenWriting { min_words, max_words, .. }, StudentAnswer::Text { value }) => {
            require_text(value, "answer.value", 12000)?;
            let words = value.split_whitespace().count();
            if words < *min_words as usize || words > *max_words as usize {
                return Err(ActivityContractError::Invalid(format!("open_writing requiere entre {min_words} y {max_words} palabras")));
            }
            Ok(())
        }
        (ExerciseSpec::GuidedDialogue { .. }, StudentAnswer::SpokenAudio { audio_upload_id, audio_duration_ms, transcript }) => {
            if audio_upload_id.is_nil() {
                return Err(ActivityContractError::Invalid("audioUploadId no puede ser nulo".into()));
            }
            let max_seconds = limits.max_audio_duration_seconds.ok_or_else(|| ActivityContractError::Invalid("falta límite de audio".into()))?;
            if *audio_duration_ms == 0 || *audio_duration_ms > max_seconds * 1000 {
                return Err(ActivityContractError::Invalid("audioDurationMs supera el límite de audio".into()));
            }
            if transcript.as_ref().is_some_and(|t| t.chars().count() > 12000) {
                return Err(ActivityContractError::Invalid("transcript complementario admite hasta 12000 caracteres".into()));
            }
            Ok(())
        }
        _ => Err(ActivityContractError::Invalid("el tipo de respuesta no corresponde al tipo de actividad".into())),
    }
}

fn validate_selected_options(options: &[ActivityOption], allow_multiple: bool, selected: &[Uuid]) -> Result<(), ActivityContractError> {
    ensure_unique(selected.iter().copied(), "optionIds")?;
    let allowed: HashSet<_> = options.iter().map(|o| o.option_id).collect();
    if selected.is_empty() || selected.iter().any(|id| !allowed.contains(id)) || (!allow_multiple && selected.len() != 1) {
        return Err(ActivityContractError::Invalid("optionIds no corresponde a las opciones disponibles".into()));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AttemptState { Evaluated, PendingReview, NotMeasured }

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeasurementState { Measured, NotMeasured }

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ActivityAttemptResult {
    pub schema_version: String,
    pub attempt_id: Uuid,
    pub activity_id: Uuid,
    pub activity_version: u32,
    pub state: AttemptState,
    pub score: Option<ActivityScore>,
    pub skill_measurements: Vec<SkillMeasurement>,
    pub feedback: ResultFeedback,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ActivityScore {
    pub earned_points: u16,
    pub max_points: u16,
    pub normalized_score: f32,
    pub partial_credit_awarded: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct SkillMeasurement {
    pub skill: LearningSkill,
    pub state: MeasurementState,
    pub score: Option<f32>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ResultFeedback {
    pub summary: String,
    pub explanation: Option<String>,
    pub revealed_answer: Option<String>,
}

impl ActivityAttemptResult {
    pub fn validate(&self) -> Result<(), ActivityContractError> {
        if self.schema_version != ACTIVITY_SCHEMA_VERSION {
            return Err(ActivityContractError::UnsupportedSchemaVersion);
        }
        match (self.state, &self.score) {
            (AttemptState::Evaluated, Some(score)) => {
                if score.max_points == 0 || score.earned_points > score.max_points
                    || !score.normalized_score.is_finite() || !(0.0..=100.0).contains(&score.normalized_score) {
                    return Err(ActivityContractError::Invalid("score debe respetar puntos y normalización 0..100".into()));
                }
            }
            (AttemptState::PendingReview | AttemptState::NotMeasured, None) => {}
            _ => return Err(ActivityContractError::Invalid("evaluated requiere score; pending_review/not_measured no lo permiten".into())),
        }
        ensure_unique(self.skill_measurements.iter().map(|m| m.skill), "skillMeasurements.skill")?;
        for m in &self.skill_measurements {
            match (m.state, m.score) {
                (MeasurementState::Measured, Some(score)) if score.is_finite() && (0.0..=100.0).contains(&score) => {}
                (MeasurementState::NotMeasured, None) => {}
                _ => return Err(ActivityContractError::Invalid("measured requiere score 0..100; not_measured requiere score nulo".into())),
            }
        }
        require_text(&self.feedback.summary, "feedback.summary", 1000)?;
        if let Some(text) = &self.feedback.explanation { require_text(text, "feedback.explanation", 4000)?; }
        if let Some(text) = &self.feedback.revealed_answer { require_text(text, "feedback.revealedAnswer", 4000)?; }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn id(n: u128) -> Uuid { Uuid::from_u128(n) }

    fn base_definition(exercise: ExerciseSpec, modality: ActivityModality) -> ActivityDefinition {
        let skills = match modality {
            ActivityModality::Spoken => vec![LearningSkill::Speaking, LearningSkill::Phonology],
            ActivityModality::Listening => vec![LearningSkill::Listening],
            ActivityModality::Practice => vec![LearningSkill::Vocabulary],
            ActivityModality::Written => vec![LearningSkill::Grammar],
        };
        let evaluation = match modality {
            ActivityModality::Spoken => EvaluationPolicy::Rubric {
                rubric_code: "spoken-a1-v1".into(), rubric_version: 1, max_points: 10,
                criteria: vec![RubricCriterion { criterion_code: "speaking".into(), description: "Comprehensible spoken response".into(), skill: LearningSkill::Speaking, max_points: 10 }],
            },
            ActivityModality::Practice => EvaluationPolicy::UnscoredPractice,
            _ => EvaluationPolicy::Deterministic { max_points: 10, partial_credit: PartialCreditPolicy::PerItem, text_normalization: vec![TextNormalization::TrimWhitespace] },
        };
        ActivityDefinition {
            schema_version: ACTIVITY_SCHEMA_VERSION.into(), activity_id: id(1),
            activity_code: "a1-greetings-choice".into(), activity_version: 1,
            course_version_id: id(2), lesson_id: id(3), title: "Choose the correct greeting".into(),
            cefr_level: CefrLevel::A1, track: TrackCode::General, modality, skills,
            objective_ids: vec![id(4)], instructions: "Read and choose.".into(), stimulus: None,
            exercise, hints: vec![ActivityHint { hint_id: id(5), order: 1, title: "Think about context".into(), body: "Consider the first meeting.".into(), penalty_points: 1 }],
            evaluation, feedback: FeedbackPolicy { timing: FeedbackTiming::AfterSubmission, show_explanation: true, reveal_correct_answer_after_submission: true },
            limits: ActivityLimits { time_limit_seconds: Some(120), max_attempts: 2, max_hints: 1, max_audio_duration_seconds: None },
        }
    }

    fn multiple_choice() -> ExerciseSpec {
        ExerciseSpec::MultipleChoice {
            prompt: "How do you greet someone for the first time?".into(),
            options: vec![
                ActivityOption { option_id: id(10), text: "Nice to meet you".into() },
                ActivityOption { option_id: id(11), text: "Good night".into() },
            ],
            correct_option_ids: vec![id(10)], allow_multiple: false,
        }
    }

    #[test]
    fn valid_definition_projects_a_student_view_without_private_keys() {
        let definition = base_definition(multiple_choice(), ActivityModality::Written);
        definition.validate().unwrap();
        let public = definition.to_student_view();
        match public.exercise {
            StudentExercise::MultipleChoice { options, .. } => assert_eq!(options.len(), 2),
            _ => panic!("wrong student exercise type"),
        }
        assert_eq!(public.available_hints.len(), 1);
    }

    #[test]
    fn schema_version_and_activity_version_are_required() {
        let mut definition = base_definition(multiple_choice(), ActivityModality::Written);
        definition.schema_version = "2.0".into();
        assert_eq!(definition.validate(), Err(ActivityContractError::UnsupportedSchemaVersion));
        definition.schema_version = ACTIVITY_SCHEMA_VERSION.into();
        definition.activity_version = 0;
        assert!(definition.validate().is_err());
    }

    #[test]
    fn multiple_choice_rejects_foreign_correct_option_ids() {
        let exercise = ExerciseSpec::MultipleChoice {
            prompt: "Choose".into(),
            options: vec![
                ActivityOption { option_id: id(10), text: "A".into() },
                ActivityOption { option_id: id(11), text: "B".into() },
            ],
            correct_option_ids: vec![id(12)], allow_multiple: false,
        };
        assert!(base_definition(exercise, ActivityModality::Written).validate().is_err());
    }

    #[test]
    fn listening_requires_an_audio_only_stimulus_and_hides_transcript_metadata() {
        let q = ChoiceQuestion {
            question_id: id(20), prompt: "What time does the train leave?".into(),
            options: vec![
                ActivityOption { option_id: id(21), text: "At nine".into() },
                ActivityOption { option_id: id(22), text: "At ten".into() },
            ],
            correct_option_ids: vec![id(21)], allow_multiple: false,
        };
        let mut definition = base_definition(
            ExerciseSpec::ListeningComprehension { prompt: "Listen and answer.".into(), questions: vec![q] },
            ActivityModality::Listening,
        );
        definition.stimulus = Some(ActivityStimulus::Audio { asset_id: id(30), transcript_policy: TranscriptPolicy::AfterSubmission });
        definition.validate().unwrap();
        match definition.to_student_view().stimulus {
            Some(StudentStimulus::Audio { asset_id }) => assert_eq!(asset_id, id(30)),
            _ => panic!("audio stimulus must be public without transcript settings"),
        }
        definition.stimulus = Some(ActivityStimulus::TextAndAudio { text: "the answer".into(), audio_asset_id: id(30), transcript_policy: TranscriptPolicy::Never });
        assert!(definition.validate().is_err());
    }

    #[test]
    fn listening_without_audio_is_rejected() {
        let mut definition = base_definition(
            ExerciseSpec::Dictation { prompt: "Listen and type.".into(), accepted_transcripts: vec!["Hello there.".into()] },
            ActivityModality::Listening,
        );
        definition.stimulus = None;
        assert!(definition.validate().is_err());
    }

    #[test]
    fn spoken_dialogue_requires_speaking_rubric_and_audio_limit() {
        let mut definition = base_definition(
            ExerciseSpec::GuidedDialogue { scenario: "A work introduction".into(), opening_prompt: "Tell me about your role.".into(), max_turns: 4 },
            ActivityModality::Spoken,
        );
        definition.limits.max_audio_duration_seconds = Some(90);
        definition.validate().unwrap();
        definition.limits.max_audio_duration_seconds = None;
        assert!(definition.validate().is_err());
    }

    #[test]
    fn open_writing_requires_writing_skill_and_versioned_rubric() {
        let definition = base_definition(
            ExerciseSpec::OpenWriting { prompt: "Write an introduction.".into(), min_words: 20, max_words: 80 },
            ActivityModality::Written,
        );
        assert!(definition.validate().is_err());
    }

    #[test]
    fn rubric_points_must_match_criteria_sum() {
        let mut definition = base_definition(
            ExerciseSpec::GuidedDialogue { scenario: "Interview".into(), opening_prompt: "What do you do?".into(), max_turns: 4 },
            ActivityModality::Spoken,
        );
        definition.limits.max_audio_duration_seconds = Some(60);
        if let EvaluationPolicy::Rubric { max_points, .. } = &mut definition.evaluation { *max_points = 12; }
        assert!(definition.validate().is_err());
    }

    #[test]
    fn submission_must_match_version_and_known_options() {
        let definition = base_definition(multiple_choice(), ActivityModality::Written);
        let valid = ActivitySubmission {
            schema_version: ACTIVITY_SCHEMA_VERSION.into(), activity_id: id(1), activity_version: 1,
            idempotency_key: id(50), answer: StudentAnswer::SelectedOptions { option_ids: vec![id(10)] },
            hints_used: vec![id(5)], active_duration_ms: 10_000,
        };
        definition.validate_submission(&valid).unwrap();
        let mut stale = valid.clone();
        stale.activity_version = 2;
        assert_eq!(definition.validate_submission(&stale), Err(ActivityContractError::ActivityVersionMismatch));
        let mut foreign = valid;
        foreign.answer = StudentAnswer::SelectedOptions { option_ids: vec![id(999)] };
        assert!(definition.validate_submission(&foreign).is_err());
    }

    #[test]
    fn submission_rejects_excess_time_and_unknown_hints() {
        let definition = base_definition(multiple_choice(), ActivityModality::Written);
        let submission = ActivitySubmission {
            schema_version: ACTIVITY_SCHEMA_VERSION.into(), activity_id: id(1), activity_version: 1,
            idempotency_key: id(50), answer: StudentAnswer::SelectedOptions { option_ids: vec![id(10)] },
            hints_used: vec![id(999)], active_duration_ms: 121_000,
        };
        assert!(definition.validate_submission(&submission).is_err());
    }

    #[test]
    fn fill_blank_requires_exactly_one_placeholder_per_gap() {
        let definition = base_definition(
            ExerciseSpec::FillBlank {
                prompt_template: "My name is {{00000000-0000-0000-0000-00000000000a}}.".into(),
                gaps: vec![GapDefinition { gap_id: id(10), accepted_answers: vec!["Kevin".into()] }],
            },
            ActivityModality::Written,
        );
        definition.validate().unwrap();
    }

    #[test]
    fn result_does_not_assign_a_score_to_unmeasured_speaking() {
        let result = ActivityAttemptResult {
            schema_version: ACTIVITY_SCHEMA_VERSION.into(), attempt_id: id(60),
            activity_id: id(1), activity_version: 1, state: AttemptState::NotMeasured, score: None,
            skill_measurements: vec![SkillMeasurement { skill: LearningSkill::Speaking, state: MeasurementState::NotMeasured, score: None }],
            feedback: ResultFeedback { summary: "Audio was not measurable.".into(), explanation: None, revealed_answer: None },
        };
        result.validate().unwrap();
    }
}
