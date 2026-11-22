//! Deterministic and rubric-based assessment for versioned learning activities.
//! This module never evaluates spoken pronunciation or fluency from a transcript.

use crate::activity_contract::{
    ActivityAttemptResult, ActivityDefinition, ActivityScore, ActivitySubmission, AttemptState,
    ErrorPatternFeedback, EvaluationPolicy, ExerciseSpec, LearningSkill, MeasurementState,
    PartialCreditPolicy, ResultFeedback, RubricCriterion, SkillMeasurement, StudentAnswer,
    TextNormalization,
};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use unicode_normalization::UnicodeNormalization;
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RubricEvaluationOutput {
    pub rubric_code: String,
    pub rubric_version: u32,
    pub criterion_scores: Vec<RubricCriterionScore>,
    pub summary: String,
    pub explanation: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct RubricCriterionScore {
    pub criterion_code: String,
    pub earned_points: u16,
    pub feedback: String,
}

fn invalid(message: impl Into<String>) -> crate::activity_contract::ActivityContractError {
    crate::activity_contract::ActivityContractError::Invalid(message.into())
}

pub fn evaluate_deterministic(
    activity: &ActivityDefinition,
    submission: &ActivitySubmission,
) -> Result<ActivityAttemptResult, crate::activity_contract::ActivityContractError> {
    activity.validate()?;
    activity.validate_submission(submission)?;

    let (max_points, partial_credit, normalizations) = match &activity.evaluation {
        EvaluationPolicy::Deterministic {
            max_points,
            partial_credit,
            text_normalization,
        } => (*max_points, partial_credit, text_normalization.as_slice()),
        EvaluationPolicy::Rubric { .. } => {
            return Err(invalid("rubric activities require a rubric evaluator"));
        }
        EvaluationPolicy::UnscoredPractice => {
            let result = unscored_practice_result(activity);
            result.validate()?;
            return Ok(result);
        }
    };

    let outcomes = deterministic_item_outcomes(activity, submission, normalizations)?;
    if outcomes.is_empty() {
        return Err(invalid(
            "deterministic evaluation produced no scoreable items",
        ));
    }

    let raw_points = score_items(&outcomes, max_points, partial_credit);
    let penalty = hint_penalty(activity, submission);
    let earned_points = raw_points.saturating_sub(penalty);
    let normalized_score = normalize_score(earned_points, max_points);
    // Hint penalties affect points, not whether the learner's answer was correct.
    let all_correct = outcomes.iter().all(|outcome| *outcome >= 1.0);
    let correct_answer = if activity.feedback.reveal_correct_answer_after_submission {
        revealed_answer(&activity.exercise)
    } else {
        None
    };
    let explanation = if activity.feedback.show_explanation {
        if all_correct {
            activity.feedback.correct_explanation.clone().or_else(|| {
                Some(
                    "La respuesta coincide con las soluciones publicadas para esta actividad."
                        .to_string(),
                )
            })
        } else {
            activity.feedback.incorrect_explanation.clone().or_else(|| {
                Some(
                    "Revisa la explicación y compara tu respuesta con los ejemplos de referencia."
                        .to_string(),
                )
            })
        }
    } else {
        None
    };
    let detailed_explanation = activity
        .feedback
        .show_explanation
        .then(|| activity.feedback.detailed_explanation.clone())
        .flatten();
    let error_pattern = if all_correct {
        None
    } else {
        activity.feedback.error_pattern.as_ref().map(|pattern| ErrorPatternFeedback {
            code: pattern.code.clone(),
            label: pattern.label.clone(),
            remediation: pattern.remediation.clone(),
            occurrences: 0,
            recurring: false,
        })
    };
    let result = ActivityAttemptResult {
        schema_version: activity.schema_version.clone(),
        attempt_id: Uuid::new_v4(),
        activity_id: activity.activity_id,
        activity_version: activity.activity_version,
        state: AttemptState::Evaluated,
        score: Some(ActivityScore {
            earned_points,
            max_points,
            normalized_score,
            partial_credit_awarded: earned_points > 0 && earned_points < max_points,
        }),
        skill_measurements: activity
            .skills
            .iter()
            .copied()
            .map(|skill| SkillMeasurement {
                skill,
                state: MeasurementState::Measured,
                score: Some(normalized_score),
            })
            .collect(),
        feedback: ResultFeedback {
            summary: if all_correct {
                "¡Correcto! Has completado la actividad.".to_string()
            } else {
                format!("Resultado: {earned_points} de {max_points} puntos.")
            },
            explanation,
            revealed_answer: correct_answer,
            equivalent_examples: if all_correct {
                Vec::new()
            } else {
                activity.feedback.equivalent_examples.clone()
            },
            detailed_explanation,
            error_pattern,
        },
    };
    result.validate()?;
    Ok(result)
}

pub fn apply_rubric_evaluation(
    activity: &ActivityDefinition,
    submission: &ActivitySubmission,
    output: RubricEvaluationOutput,
) -> Result<ActivityAttemptResult, crate::activity_contract::ActivityContractError> {
    activity.validate()?;
    activity.validate_submission(submission)?;
    if activity.modality != crate::activity_contract::ActivityModality::Written
        || !matches!(&activity.exercise, ExerciseSpec::OpenWriting { .. })
    {
        return Err(invalid(
            "rubric scoring is reserved for written open_writing activities",
        ));
    }

    let (rubric_code, rubric_version, max_points, criteria) = match &activity.evaluation {
        EvaluationPolicy::Rubric {
            rubric_code,
            rubric_version,
            max_points,
            criteria,
        } => (rubric_code, *rubric_version, *max_points, criteria),
        _ => return Err(invalid("activity does not define a rubric")),
    };

    if output.rubric_code != *rubric_code || output.rubric_version != rubric_version {
        return Err(invalid(
            "AI rubric identity does not match the published rubric version",
        ));
    }
    if output.criterion_scores.len() != criteria.len()
        || output.summary.trim().is_empty()
        || output.summary.chars().count() > 1000
        || output.explanation.trim().is_empty()
        || output.explanation.chars().count() > 4000
    {
        return Err(invalid(
            "AI rubric output is incomplete or exceeds feedback limits",
        ));
    }

    let expected: HashMap<&str, &RubricCriterion> = criteria
        .iter()
        .map(|criterion| (criterion.criterion_code.as_str(), criterion))
        .collect();
    let mut seen = HashSet::new();
    let mut raw_earned = 0u32;
    let mut skill_totals: Vec<(LearningSkill, u32, u32)> = activity
        .skills
        .iter()
        .copied()
        .map(|skill| (skill, 0, 0))
        .collect();

    for score in &output.criterion_scores {
        if !seen.insert(score.criterion_code.as_str()) {
            return Err(invalid(
                "AI rubric output contains duplicate criterion codes",
            ));
        }
        let criterion = expected
            .get(score.criterion_code.as_str())
            .ok_or_else(|| invalid("AI rubric output contains an unknown criterion"))?;
        if score.earned_points > criterion.max_points
            || score.feedback.trim().is_empty()
            || score.feedback.chars().count() > 1200
        {
            return Err(invalid(
                "AI rubric criterion score or feedback is outside its limits",
            ));
        }
        raw_earned += score.earned_points as u32;
        if let Some(total) = skill_totals
            .iter_mut()
            .find(|(skill, _, _)| *skill == criterion.skill)
        {
            total.1 += score.earned_points as u32;
            total.2 += criterion.max_points as u32;
        }
    }

    if seen.len() != expected.len() || raw_earned > max_points as u32 {
        return Err(invalid(
            "AI rubric output does not cover the exact published criteria",
        ));
    }

    let earned_points = (raw_earned as u16).saturating_sub(hint_penalty(activity, submission));
    let normalized_score = normalize_score(earned_points, max_points);
    let skill_measurements = skill_totals
        .into_iter()
        .map(|(skill, earned, possible)| {
            if possible == 0 {
                SkillMeasurement {
                    skill,
                    state: MeasurementState::NotMeasured,
                    score: None,
                }
            } else {
                SkillMeasurement {
                    skill,
                    state: MeasurementState::Measured,
                    score: Some(normalize_score(earned as u16, possible as u16)),
                }
            }
        })
        .collect();

    let criterion_feedback = output
        .criterion_scores
        .iter()
        .map(|score| format!("{}: {}", score.criterion_code, score.feedback))
        .collect::<Vec<_>>()
        .join("\n");
    let generated_explanation = format!("{}\n\n{}", output.explanation, criterion_feedback);
    if generated_explanation.chars().count() > 4000 {
        return Err(invalid(
            "combined rubric explanation exceeds 4000 characters",
        ));
    }
    // A hint penalty is not an answer error and must not create an error-pattern event.
    let is_correct = raw_earned == u32::from(max_points);
    let explanation = if is_correct {
        activity.feedback.correct_explanation.clone().unwrap_or(generated_explanation)
    } else {
        activity.feedback.incorrect_explanation.clone().unwrap_or(generated_explanation)
    };
    let detailed_explanation = activity
        .feedback
        .show_explanation
        .then(|| activity.feedback.detailed_explanation.clone())
        .flatten();
    let error_pattern = if is_correct {
        None
    } else {
        activity.feedback.error_pattern.as_ref().map(|pattern| ErrorPatternFeedback {
            code: pattern.code.clone(),
            label: pattern.label.clone(),
            remediation: pattern.remediation.clone(),
            occurrences: 0,
            recurring: false,
        })
    };

    let result = ActivityAttemptResult {
        schema_version: activity.schema_version.clone(),
        attempt_id: Uuid::new_v4(),
        activity_id: activity.activity_id,
        activity_version: activity.activity_version,
        state: AttemptState::Evaluated,
        score: Some(ActivityScore {
            earned_points,
            max_points,
            normalized_score,
            partial_credit_awarded: earned_points > 0 && earned_points < max_points,
        }),
        skill_measurements,
        feedback: ResultFeedback {
            summary: output.summary,
            explanation: activity.feedback.show_explanation.then_some(explanation),
            revealed_answer: None,
            equivalent_examples: if is_correct {
                Vec::new()
            } else {
                activity.feedback.equivalent_examples.clone()
            },
            detailed_explanation,
            error_pattern,
        },
    };
    result.validate()?;
    Ok(result)
}

pub fn pending_acoustic_review(
    activity: &ActivityDefinition,
    submission: &ActivitySubmission,
) -> Result<ActivityAttemptResult, crate::activity_contract::ActivityContractError> {
    activity.validate()?;
    activity.validate_submission(submission)?;
    if activity.modality != crate::activity_contract::ActivityModality::Spoken {
        return Err(invalid("acoustic review is reserved for spoken activities"));
    }
    let result = ActivityAttemptResult {
        schema_version: activity.schema_version.clone(),
        attempt_id: Uuid::new_v4(),
        activity_id: activity.activity_id,
        activity_version: activity.activity_version,
        state: AttemptState::PendingReview,
        score: None,
        skill_measurements: activity
            .skills
            .iter()
            .copied()
            .map(|skill| SkillMeasurement {
                skill,
                state: MeasurementState::NotMeasured,
                score: None,
            })
            .collect(),
        feedback: ResultFeedback {
            summary: "Envío recibido. La verificación de la evidencia y la evaluación acústica de pronunciación y fluidez quedan pendientes; no se infieren desde la transcripción.".to_string(),
            explanation: None,
            revealed_answer: None,
            equivalent_examples: Vec::new(),
            detailed_explanation: None,
            error_pattern: None,
        },
    };
    result.validate()?;
    Ok(result)
}

fn unscored_practice_result(activity: &ActivityDefinition) -> ActivityAttemptResult {
    ActivityAttemptResult {
        schema_version: activity.schema_version.clone(),
        attempt_id: Uuid::new_v4(),
        activity_id: activity.activity_id,
        activity_version: activity.activity_version,
        state: AttemptState::NotMeasured,
        score: None,
        skill_measurements: activity
            .skills
            .iter()
            .copied()
            .map(|skill| SkillMeasurement {
                skill,
                state: MeasurementState::NotMeasured,
                score: None,
            })
            .collect(),
        feedback: ResultFeedback {
            summary: "Práctica registrada. Esta actividad no genera una puntuación académica."
                .to_string(),
            explanation: None,
            revealed_answer: None,
            equivalent_examples: Vec::new(),
            detailed_explanation: None,
            error_pattern: None,
        },
    }
}

fn deterministic_item_outcomes(
    activity: &ActivityDefinition,
    submission: &ActivitySubmission,
    normalizations: &[TextNormalization],
) -> Result<Vec<f32>, crate::activity_contract::ActivityContractError> {
    let outcomes = match (&activity.exercise, &submission.answer) {
        (
            ExerciseSpec::MultipleChoice {
                correct_option_ids, ..
            },
            StudentAnswer::SelectedOptions { option_ids },
        ) => vec![option_set_ratio(correct_option_ids, option_ids)],
        (
            ExerciseSpec::Translation {
                accepted_answers, ..
            }
            | ExerciseSpec::Dictation {
                accepted_transcripts: accepted_answers,
                ..
            }
            | ExerciseSpec::GrammarTransformation {
                accepted_answers, ..
            }
            | ExerciseSpec::ErrorCorrection {
                accepted_answers, ..
            }
            | ExerciseSpec::VocabularyRecall {
                accepted_answers, ..
            },
            StudentAnswer::Text { value },
        ) => vec![text_matches(value, accepted_answers, normalizations) as u8 as f32],
        (ExerciseSpec::FillBlank { gaps, .. }, StudentAnswer::GapAnswers { answers }) => {
            let provided: HashMap<Uuid, &str> = answers
                .iter()
                .map(|answer| (answer.gap_id, answer.value.as_str()))
                .collect();
            gaps.iter()
                .map(|gap| {
                    provided.get(&gap.gap_id).is_some_and(|value| {
                        text_matches(value, &gap.accepted_answers, normalizations)
                    }) as u8 as f32
                })
                .collect()
        }
        (
            ExerciseSpec::WordOrder {
                expected_token_order,
                ..
            },
            StudentAnswer::OrderedTokens { token_ids },
        ) => expected_token_order
            .iter()
            .enumerate()
            .map(|(index, expected)| (token_ids.get(index) == Some(expected)) as u8 as f32)
            .collect(),
        (
            ExerciseSpec::Matching {
                left_items,
                correct_pairs,
                ..
            },
            StudentAnswer::Matching { pairs },
        ) => left_items
            .iter()
            .map(|left| {
                let expected = correct_pairs
                    .iter()
                    .find(|pair| pair.left_id == left.item_id);
                let actual = pairs.iter().find(|pair| pair.left_id == left.item_id);
                (expected == actual) as u8 as f32
            })
            .collect(),
        (
            ExerciseSpec::ListeningComprehension { questions, .. }
            | ExerciseSpec::ReadingComprehension { questions, .. },
            StudentAnswer::QuestionChoices { answers },
        ) => questions
            .iter()
            .map(|question| {
                let submitted = answers
                    .iter()
                    .find(|answer| answer.question_id == question.question_id);
                let selected = submitted
                    .map(|answer| answer.option_ids.as_slice())
                    .unwrap_or_default();
                option_set_ratio(&question.correct_option_ids, selected)
            })
            .collect(),
        _ => return Err(invalid("answer type does not match deterministic exercise")),
    };
    Ok(outcomes)
}

fn option_set_ratio(expected: &[Uuid], selected: &[Uuid]) -> f32 {
    let expected_set: HashSet<Uuid> = expected.iter().copied().collect();
    let selected_set: HashSet<Uuid> = selected.iter().copied().collect();
    let intersection = expected_set.intersection(&selected_set).count();
    let union = expected_set.union(&selected_set).count();
    if union == 0 {
        0.0
    } else {
        intersection as f32 / union as f32
    }
}

fn text_matches(
    value: &str,
    accepted_answers: &[String],
    normalizations: &[TextNormalization],
) -> bool {
    let normalized = normalize_text(value, normalizations);
    accepted_answers
        .iter()
        .any(|accepted| normalize_text(accepted, normalizations) == normalized)
}

fn normalize_text(value: &str, normalizations: &[TextNormalization]) -> String {
    let mut normalized = value.to_string();
    for normalization in normalizations {
        normalized = match normalization {
            TextNormalization::TrimWhitespace => normalized.trim().to_string(),
            TextNormalization::CollapseWhitespace => {
                normalized.split_whitespace().collect::<Vec<_>>().join(" ")
            }
            TextNormalization::CaseInsensitive => normalized.to_lowercase(),
            TextNormalization::NormalizePunctuation => normalized
                .chars()
                .filter(|character| !character.is_ascii_punctuation())
                .collect(),
            TextNormalization::UnicodeNfc => normalized.nfc().collect(),
        };
    }
    normalized
}

fn score_items(outcomes: &[f32], max_points: u16, policy: &PartialCreditPolicy) -> u16 {
    if outcomes.is_empty() {
        return 0;
    }
    match policy {
        PartialCreditPolicy::None => {
            if outcomes.iter().all(|outcome| *outcome >= 1.0) {
                max_points
            } else {
                0
            }
        }
        PartialCreditPolicy::PerItem | PartialCreditPolicy::Proportional => {
            let count = outcomes.len() as u16;
            let base = max_points / count;
            let remainder = max_points % count;
            outcomes
                .iter()
                .enumerate()
                .map(|(index, outcome)| {
                    let item_points = base + if (index as u16) < remainder { 1 } else { 0 };
                    let ratio = match policy {
                        PartialCreditPolicy::PerItem => {
                            if *outcome >= 1.0 {
                                1.0
                            } else {
                                0.0
                            }
                        }
                        PartialCreditPolicy::Proportional => outcome.clamp(0.0, 1.0),
                        PartialCreditPolicy::None => unreachable!(),
                    };
                    (item_points as f32 * ratio).round() as u16
                })
                .sum()
        }
    }
}

fn hint_penalty(activity: &ActivityDefinition, submission: &ActivitySubmission) -> u16 {
    submission
        .hints_used
        .iter()
        .filter_map(|hint_id| activity.hints.iter().find(|hint| hint.hint_id == *hint_id))
        .fold(0u16, |total, hint| {
            total.saturating_add(hint.penalty_points)
        })
}

fn normalize_score(earned: u16, possible: u16) -> f32 {
    if possible == 0 {
        0.0
    } else {
        ((earned as f32 / possible as f32) * 10_000.0).round() / 100.0
    }
}

fn revealed_answer(exercise: &ExerciseSpec) -> Option<String> {
    match exercise {
        ExerciseSpec::MultipleChoice {
            options,
            correct_option_ids,
            ..
        } => Some(
            options
                .iter()
                .filter(|option| correct_option_ids.contains(&option.option_id))
                .map(|option| option.text.as_str())
                .collect::<Vec<_>>()
                .join(" / "),
        ),
        ExerciseSpec::Translation {
            accepted_answers, ..
        }
        | ExerciseSpec::Dictation {
            accepted_transcripts: accepted_answers,
            ..
        }
        | ExerciseSpec::GrammarTransformation {
            accepted_answers, ..
        }
        | ExerciseSpec::ErrorCorrection {
            accepted_answers, ..
        }
        | ExerciseSpec::VocabularyRecall {
            accepted_answers, ..
        } => accepted_answers.first().cloned(),
        ExerciseSpec::FillBlank {
            prompt_template,
            gaps,
        } => {
            let mut answer = prompt_template.clone();
            for gap in gaps {
                let marker = format!("{{{{{}}}}}", gap.gap_id);
                answer = answer.replace(&marker, gap.accepted_answers.first()?);
            }
            Some(answer)
        }
        ExerciseSpec::WordOrder {
            tokens,
            expected_token_order,
            ..
        } => {
            let by_id: HashMap<Uuid, &str> = tokens
                .iter()
                .map(|token| (token.token_id, token.text.as_str()))
                .collect();
            Some(
                expected_token_order
                    .iter()
                    .filter_map(|token_id| by_id.get(token_id).copied())
                    .collect::<Vec<_>>()
                    .join(" "),
            )
        }
        ExerciseSpec::Matching {
            left_items,
            right_items,
            correct_pairs,
            ..
        } => {
            let left: HashMap<Uuid, &str> = left_items
                .iter()
                .map(|item| (item.item_id, item.text.as_str()))
                .collect();
            let right: HashMap<Uuid, &str> = right_items
                .iter()
                .map(|item| (item.item_id, item.text.as_str()))
                .collect();
            Some(
                correct_pairs
                    .iter()
                    .filter_map(|pair| {
                        Some(format!(
                            "{} → {}",
                            left.get(&pair.left_id)?,
                            right.get(&pair.right_id)?
                        ))
                    })
                    .collect::<Vec<_>>()
                    .join("; "),
            )
        }
        ExerciseSpec::ListeningComprehension { questions, .. }
        | ExerciseSpec::ReadingComprehension { questions, .. } => {
            let lines: Vec<String> = questions
                .iter()
                .map(|question| {
                    let answers = question
                        .options
                        .iter()
                        .filter(|option| question.correct_option_ids.contains(&option.option_id))
                        .map(|option| option.text.as_str())
                        .collect::<Vec<_>>()
                        .join(" / ");
                    format!("{}: {}", question.prompt, answers)
                })
                .collect();
            Some(lines.join("\n"))
        }
        ExerciseSpec::OpenWriting { .. } | ExerciseSpec::GuidedDialogue { .. } => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::activity_contract::{
        ActivityHint, ActivityLimits, ActivityModality, ActivityOption, ActivityStimulus,
        CefrLevel, ChoiceQuestion, FeedbackErrorPattern, FeedbackPolicy, FeedbackTiming,
        GapAnswer, GapDefinition,
        MatchItem, MatchPair, OrderedToken, QuestionChoiceAnswer, RubricCriterion, TrackCode,
        TranslationDirection,
    };

    fn id(value: u128) -> Uuid {
        Uuid::from_u128(value)
    }

    fn deterministic_activity(
        exercise: ExerciseSpec,
        modality: ActivityModality,
        skill: LearningSkill,
        partial_credit: PartialCreditPolicy,
        normalizations: Vec<TextNormalization>,
    ) -> ActivityDefinition {
        ActivityDefinition {
            schema_version: "1.0".into(),
            activity_id: id(1),
            activity_code: "a1-assessment-test".into(),
            activity_version: 1,
            course_version_id: id(2),
            lesson_id: id(3),
            title: "Assessment test".into(),
            cefr_level: CefrLevel::A1,
            track: TrackCode::General,
            modality,
            skills: vec![skill],
            objective_ids: vec![id(4)],
            instructions: "Complete the activity.".into(),
            stimulus: if modality == ActivityModality::Listening {
                Some(ActivityStimulus::Audio {
                    asset_id: id(9),
                    transcript_policy: crate::activity_contract::TranscriptPolicy::Never,
                })
            } else {
                None
            },
            exercise,
            hints: vec![ActivityHint {
                hint_id: id(5),
                order: 1,
                title: "Hint".into(),
                body: "Use the context.".into(),
                penalty_points: 2,
            }],
            evaluation: EvaluationPolicy::Deterministic {
                max_points: 10,
                partial_credit,
                text_normalization: normalizations,
            },
            feedback: FeedbackPolicy {
                timing: FeedbackTiming::AfterSubmission,
                show_explanation: true,
                reveal_correct_answer_after_submission: true,
                correct_explanation: None,
                incorrect_explanation: None,
                detailed_explanation: None,
                equivalent_examples: Vec::new(),
                error_pattern: None,
            },
            limits: ActivityLimits {
                time_limit_seconds: Some(120),
                max_attempts: 3,
                max_hints: 1,
                max_audio_duration_seconds: if modality == ActivityModality::Spoken {
                    Some(60)
                } else {
                    None
                },
            },
        }
    }

    fn submission(answer: StudentAnswer, key: u128) -> ActivitySubmission {
        ActivitySubmission {
            schema_version: "1.0".into(),
            activity_id: id(1),
            activity_version: 1,
            idempotency_key: id(key),
            answer,
            hints_used: vec![],
            active_duration_ms: 10_000,
        }
    }

    fn assert_full_score(activity: ActivityDefinition, submission: ActivitySubmission) {
        activity.validate().unwrap();
        let result = evaluate_deterministic(&activity, &submission).unwrap();
        assert_eq!(result.state, AttemptState::Evaluated);
        let score = result.score.unwrap();
        assert_eq!(score.earned_points, 10);
        assert_eq!(score.max_points, 10);
        assert_eq!(score.normalized_score, 100.0);
    }

    #[test]
    fn additional_closed_text_exercises_use_their_explicit_answer_sets() {
        let dictation = deterministic_activity(
            ExerciseSpec::Dictation {
                prompt: "Listen and write the phrase.".into(),
                accepted_transcripts: vec!["Good morning".into(), "Good morning!".into()],
            },
            ActivityModality::Listening,
            LearningSkill::Listening,
            PartialCreditPolicy::None,
            vec![
                TextNormalization::CaseInsensitive,
                TextNormalization::TrimWhitespace,
            ],
        );
        assert_full_score(
            dictation,
            submission(
                StudentAnswer::Text {
                    value: " GOOD MORNING ".into(),
                },
                111,
            ),
        );

        let grammar = deterministic_activity(
            ExerciseSpec::GrammarTransformation {
                prompt: "Use the past simple.".into(),
                source_sentence: "I work here.".into(),
                accepted_answers: vec!["I worked here.".into()],
            },
            ActivityModality::Written,
            LearningSkill::Grammar,
            PartialCreditPolicy::None,
            vec![
                TextNormalization::CaseInsensitive,
                TextNormalization::TrimWhitespace,
            ],
        );
        assert_full_score(
            grammar,
            submission(
                StudentAnswer::Text {
                    value: "i worked here.".into(),
                },
                112,
            ),
        );

        let correction = deterministic_activity(
            ExerciseSpec::ErrorCorrection {
                prompt: "Correct the sentence.".into(),
                source_sentence: "She work every day.".into(),
                accepted_answers: vec!["She works every day.".into()],
            },
            ActivityModality::Written,
            LearningSkill::Grammar,
            PartialCreditPolicy::None,
            vec![
                TextNormalization::CaseInsensitive,
                TextNormalization::TrimWhitespace,
            ],
        );
        let wrong = submission(
            StudentAnswer::Text {
                value: "She work everyday.".into(),
            },
            113,
        );
        assert_eq!(
            evaluate_deterministic(&correction, &wrong)
                .unwrap()
                .score
                .unwrap()
                .earned_points,
            0
        );
    }

    #[test]
    fn practice_recall_is_never_scored_as_academic_evidence() {
        let mut activity = deterministic_activity(
            ExerciseSpec::VocabularyRecall {
                prompt: "Recall the translation.".into(),
                vocabulary_word_id: id(40),
                direction: TranslationDirection::EnglishToSpanish,
                accepted_answers: vec!["casa".into()],
            },
            ActivityModality::Practice,
            LearningSkill::Vocabulary,
            PartialCreditPolicy::None,
            vec![],
        );
        activity.evaluation = EvaluationPolicy::UnscoredPractice;
        let result = evaluate_deterministic(
            &activity,
            &submission(
                StudentAnswer::Text {
                    value: "casa".into(),
                },
                114,
            ),
        )
        .unwrap();
        assert_eq!(result.state, AttemptState::NotMeasured);
        assert!(result.score.is_none());
        assert!(result
            .skill_measurements
            .iter()
            .all(|metric| metric.score.is_none()));
    }

    #[test]
    fn multiple_choice_requires_exact_published_option_ids() {
        let activity = deterministic_activity(
            ExerciseSpec::MultipleChoice {
                prompt: "Choose the greeting.".into(),
                options: vec![
                    ActivityOption {
                        option_id: id(10),
                        text: "Hello".into(),
                    },
                    ActivityOption {
                        option_id: id(11),
                        text: "Goodbye".into(),
                    },
                ],
                correct_option_ids: vec![id(10)],
                allow_multiple: false,
            },
            ActivityModality::Written,
            LearningSkill::Vocabulary,
            PartialCreditPolicy::None,
            vec![],
        );
        assert_full_score(
            activity,
            submission(
                StudentAnswer::SelectedOptions {
                    option_ids: vec![id(10)],
                },
                100,
            ),
        );
    }


    #[test]
    fn deterministic_feedback_uses_editorial_explanations_examples_and_error_patterns() {
        let mut activity = deterministic_activity(
            ExerciseSpec::MultipleChoice {
                prompt: "Choose the greeting.".into(),
                options: vec![
                    ActivityOption { option_id: id(10), text: "Hello".into() },
                    ActivityOption { option_id: id(11), text: "Goodbye".into() },
                ],
                correct_option_ids: vec![id(10)],
                allow_multiple: false,
            },
            ActivityModality::Written,
            LearningSkill::Vocabulary,
            PartialCreditPolicy::None,
            vec![],
        );
        activity.feedback.correct_explanation =
            Some("This is the greeting used at the start of a conversation.".into());
        activity.feedback.incorrect_explanation =
            Some("Choose the greeting, not the expression used to leave.".into());
        activity.feedback.detailed_explanation = Some(
            "Hello is used when you meet or address someone. Goodbye is used when leaving.".into(),
        );
        activity.feedback.equivalent_examples = vec!["Hi".into(), "Good morning".into()];
        activity.feedback.error_pattern = Some(FeedbackErrorPattern {
            code: "a1.greeting.context".into(),
            label: "Greeting context".into(),
            remediation: "Match the expression to the social situation.".into(),
        });
        activity.validate().unwrap();

        let wrong = evaluate_deterministic(
            &activity,
            &submission(
                StudentAnswer::SelectedOptions { option_ids: vec![id(11)] },
                150,
            ),
        )
        .unwrap();
        assert_eq!(
            wrong.feedback.explanation.as_deref(),
            Some("Choose the greeting, not the expression used to leave.")
        );
        assert_eq!(wrong.feedback.equivalent_examples, vec!["Hi", "Good morning"]);
        assert!(wrong.feedback.detailed_explanation.is_some());
        let pattern = wrong.feedback.error_pattern.unwrap();
        assert_eq!(pattern.code, "a1.greeting.context");
        assert_eq!(pattern.occurrences, 0);
        assert!(!pattern.recurring);

        let correct = evaluate_deterministic(
            &activity,
            &submission(
                StudentAnswer::SelectedOptions { option_ids: vec![id(10)] },
                151,
            ),
        )
        .unwrap();
        assert_eq!(
            correct.feedback.explanation.as_deref(),
            Some("This is the greeting used at the start of a conversation.")
        );
        assert!(correct.feedback.equivalent_examples.is_empty());
        assert!(correct.feedback.error_pattern.is_none());

        let mut correct_with_hint = submission(
            StudentAnswer::SelectedOptions { option_ids: vec![id(10)] },
            152,
        );
        correct_with_hint.hints_used = vec![id(5)];
        let penalized_but_correct = evaluate_deterministic(&activity, &correct_with_hint).unwrap();
        assert_eq!(penalized_but_correct.score.unwrap().earned_points, 8);
        assert_eq!(
            penalized_but_correct.feedback.explanation.as_deref(),
            Some("This is the greeting used at the start of a conversation.")
        );
        assert!(penalized_but_correct.feedback.error_pattern.is_none());
    }

    #[test]
    fn accepted_text_is_normalized_only_by_explicit_policy_and_never_fuzzy_matched() {
        let normalizations = vec![
            TextNormalization::TrimWhitespace,
            TextNormalization::CollapseWhitespace,
            TextNormalization::CaseInsensitive,
            TextNormalization::NormalizePunctuation,
            TextNormalization::UnicodeNfc,
        ];
        let activity = deterministic_activity(
            ExerciseSpec::Translation {
                prompt: "Translate.".into(),
                source_text: "Good morning".into(),
                direction: TranslationDirection::EnglishToSpanish,
                accepted_answers: vec!["Buenos días".into()],
            },
            ActivityModality::Written,
            LearningSkill::Vocabulary,
            PartialCreditPolicy::None,
            normalizations,
        );
        assert_full_score(
            activity.clone(),
            submission(
                StudentAnswer::Text {
                    value: "  BUENOS   DÍAS! ".into(),
                },
                101,
            ),
        );
        let wrong = submission(
            StudentAnswer::Text {
                value: "Buen día".into(),
            },
            102,
        );
        assert_eq!(
            evaluate_deterministic(&activity, &wrong)
                .unwrap()
                .score
                .unwrap()
                .earned_points,
            0
        );
    }

    #[test]
    fn fill_blank_awards_per_item_partial_credit_and_applies_hint_penalty() {
        let first_gap_id = id(10);
        let second_gap_id = id(11);
        let first_gap_marker = format!("{{{{{}}}}}", first_gap_id);
        let second_gap_marker = format!("{{{{{}}}}}", second_gap_id);
        let activity = deterministic_activity(
            ExerciseSpec::FillBlank {
                prompt_template: format!("She {first_gap_marker} {second_gap_marker} every day."),
                gaps: vec![
                    GapDefinition {
                        gap_id: first_gap_id,
                        accepted_answers: vec!["works".into()],
                    },
                    GapDefinition {
                        gap_id: second_gap_id,
                        accepted_answers: vec!["at home".into()],
                    },
                ],
            },
            ActivityModality::Written,
            LearningSkill::Grammar,
            PartialCreditPolicy::PerItem,
            vec![
                TextNormalization::CaseInsensitive,
                TextNormalization::TrimWhitespace,
            ],
        );
        let mut answer = submission(
            StudentAnswer::GapAnswers {
                answers: vec![GapAnswer {
                    gap_id: id(10),
                    value: "WORKS".into(),
                }],
            },
            104,
        );
        answer.hints_used = vec![id(5)];
        let result = evaluate_deterministic(&activity, &answer).unwrap();
        let score = result.score.unwrap();
        assert_eq!(score.earned_points, 3);
        assert_eq!(score.max_points, 10);
        assert!(score.partial_credit_awarded);
        assert!(result.feedback.revealed_answer.unwrap().contains("works"));
    }

    #[test]
    fn word_order_and_matching_are_scored_without_approximate_matching() {
        let word_order = deterministic_activity(
            ExerciseSpec::WordOrder {
                prompt: "Put the words in order.".into(),
                tokens: vec![
                    OrderedToken {
                        token_id: id(10),
                        text: "I".into(),
                    },
                    OrderedToken {
                        token_id: id(11),
                        text: "work".into(),
                    },
                    OrderedToken {
                        token_id: id(12),
                        text: "today".into(),
                    },
                ],
                expected_token_order: vec![id(10), id(11), id(12)],
            },
            ActivityModality::Written,
            LearningSkill::Grammar,
            PartialCreditPolicy::Proportional,
            vec![],
        );
        let result = evaluate_deterministic(
            &word_order,
            &submission(
                StudentAnswer::OrderedTokens {
                    token_ids: vec![id(10), id(12), id(11)],
                },
                105,
            ),
        )
        .unwrap();
        assert_eq!(result.score.unwrap().earned_points, 4);

        let matching = deterministic_activity(
            ExerciseSpec::Matching {
                prompt: "Match terms.".into(),
                left_items: vec![
                    MatchItem {
                        item_id: id(20),
                        text: "cat".into(),
                    },
                    MatchItem {
                        item_id: id(21),
                        text: "dog".into(),
                    },
                ],
                right_items: vec![
                    MatchItem {
                        item_id: id(22),
                        text: "gato".into(),
                    },
                    MatchItem {
                        item_id: id(23),
                        text: "perro".into(),
                    },
                ],
                correct_pairs: vec![
                    MatchPair {
                        left_id: id(20),
                        right_id: id(22),
                    },
                    MatchPair {
                        left_id: id(21),
                        right_id: id(23),
                    },
                ],
            },
            ActivityModality::Written,
            LearningSkill::Vocabulary,
            PartialCreditPolicy::PerItem,
            vec![],
        );
        assert_full_score(
            matching,
            submission(
                StudentAnswer::Matching {
                    pairs: vec![
                        MatchPair {
                            left_id: id(20),
                            right_id: id(22),
                        },
                        MatchPair {
                            left_id: id(21),
                            right_id: id(23),
                        },
                    ],
                },
                106,
            ),
        );
    }

    #[test]
    fn listening_and_reading_score_each_question_independently() {
        let make_question = |question_id, correct| ChoiceQuestion {
            question_id: id(question_id),
            prompt: "Choose.".into(),
            options: vec![
                ActivityOption {
                    option_id: id(correct),
                    text: "Correct".into(),
                },
                ActivityOption {
                    option_id: id(correct + 1),
                    text: "Incorrect".into(),
                },
            ],
            correct_option_ids: vec![id(correct)],
            allow_multiple: false,
        };
        let listening = deterministic_activity(
            ExerciseSpec::ListeningComprehension {
                prompt: "Listen and answer.".into(),
                questions: vec![make_question(30, 31), make_question(32, 33)],
            },
            ActivityModality::Listening,
            LearningSkill::Listening,
            PartialCreditPolicy::PerItem,
            vec![],
        );
        assert_full_score(
            listening,
            submission(
                StudentAnswer::QuestionChoices {
                    answers: vec![
                        QuestionChoiceAnswer {
                            question_id: id(30),
                            option_ids: vec![id(31)],
                        },
                        QuestionChoiceAnswer {
                            question_id: id(32),
                            option_ids: vec![id(33)],
                        },
                    ],
                },
                107,
            ),
        );

        let reading = deterministic_activity(
            ExerciseSpec::ReadingComprehension {
                passage: "A short passage.".into(),
                questions: vec![make_question(34, 35)],
            },
            ActivityModality::Written,
            LearningSkill::Reading,
            PartialCreditPolicy::None,
            vec![],
        );
        assert_full_score(
            reading,
            submission(
                StudentAnswer::QuestionChoices {
                    answers: vec![QuestionChoiceAnswer {
                        question_id: id(34),
                        option_ids: vec![id(35)],
                    }],
                },
                108,
            ),
        );
    }

    #[test]
    fn spoken_activity_never_scores_pronunciation_from_transcript() {
        let activity = ActivityDefinition {
            schema_version: "1.0".into(),
            activity_id: id(1),
            activity_code: "a1-speaking-test".into(),
            activity_version: 1,
            course_version_id: id(2),
            lesson_id: id(3),
            title: "Speak about your day".into(),
            cefr_level: CefrLevel::A1,
            track: TrackCode::General,
            modality: ActivityModality::Spoken,
            skills: vec![LearningSkill::Speaking, LearningSkill::Phonology],
            objective_ids: vec![id(4)],
            instructions: "Speak.".into(),
            stimulus: None,
            exercise: ExerciseSpec::GuidedDialogue {
                scenario: "Describe your day.".into(),
                opening_prompt: "What do you do?".into(),
                max_turns: 2,
            },
            hints: vec![],
            evaluation: EvaluationPolicy::Rubric {
                rubric_code: "speaking-a1".into(),
                rubric_version: 1,
                max_points: 10,
                criteria: vec![RubricCriterion {
                    criterion_code: "speaking".into(),
                    description: "Clear spoken response.".into(),
                    skill: LearningSkill::Speaking,
                    max_points: 10,
                }],
            },
            feedback: FeedbackPolicy {
                timing: FeedbackTiming::AfterReview,
                show_explanation: true,
                reveal_correct_answer_after_submission: false,
                correct_explanation: None,
                incorrect_explanation: None,
                detailed_explanation: None,
                equivalent_examples: Vec::new(),
                error_pattern: None,
            },
            limits: ActivityLimits {
                time_limit_seconds: None,
                max_attempts: 2,
                max_hints: 0,
                max_audio_duration_seconds: Some(60),
            },
        };
        let answer = submission(
            StudentAnswer::SpokenAudio {
                audio_upload_id: id(90),
                audio_duration_ms: 5000,
                transcript: Some("I work every day.".into()),
            },
            109,
        );
        activity.validate().unwrap();
        let result = pending_acoustic_review(&activity, &answer).unwrap();
        assert_eq!(result.state, AttemptState::PendingReview);
        assert!(result.score.is_none());
        assert!(result.skill_measurements.iter().all(|measurement| {
            measurement.state == MeasurementState::NotMeasured && measurement.score.is_none()
        }));
        assert!(apply_rubric_evaluation(
            &activity,
            &answer,
            RubricEvaluationOutput {
                rubric_code: "speaking-a1".into(),
                rubric_version: 1,
                criterion_scores: vec![RubricCriterionScore {
                    criterion_code: "speaking".into(),
                    earned_points: 10,
                    feedback: "The transcript looks fluent.".into(),
                }],
                summary: "Looks fluent.".into(),
                explanation: "This is text, not acoustic evidence.".into(),
            },
        )
        .is_err());
    }

    #[test]
    fn rubric_output_must_match_exact_version_criteria_and_point_bounds() {
        let activity = ActivityDefinition {
            schema_version: "1.0".into(),
            activity_id: id(1),
            activity_code: "a1-writing-test".into(),
            activity_version: 1,
            course_version_id: id(2),
            lesson_id: id(3),
            title: "Write about your routine".into(),
            cefr_level: CefrLevel::A1,
            track: TrackCode::General,
            modality: ActivityModality::Written,
            skills: vec![LearningSkill::Writing, LearningSkill::Grammar],
            objective_ids: vec![id(4)],
            instructions: "Write a short paragraph.".into(),
            stimulus: None,
            exercise: ExerciseSpec::OpenWriting {
                prompt: "Describe your routine.".into(),
                min_words: 3,
                max_words: 50,
            },
            hints: vec![],
            evaluation: EvaluationPolicy::Rubric {
                rubric_code: "writing-a1".into(),
                rubric_version: 2,
                max_points: 10,
                criteria: vec![
                    RubricCriterion {
                        criterion_code: "task".into(),
                        description: "Fulfils the task.".into(),
                        skill: LearningSkill::Writing,
                        max_points: 6,
                    },
                    RubricCriterion {
                        criterion_code: "grammar".into(),
                        description: "Uses basic grammar.".into(),
                        skill: LearningSkill::Grammar,
                        max_points: 4,
                    },
                ],
            },
            feedback: FeedbackPolicy {
                timing: FeedbackTiming::AfterSubmission,
                show_explanation: true,
                reveal_correct_answer_after_submission: false,
                correct_explanation: None,
                incorrect_explanation: None,
                detailed_explanation: None,
                equivalent_examples: Vec::new(),
                error_pattern: None,
            },
            limits: ActivityLimits {
                time_limit_seconds: None,
                max_attempts: 2,
                max_hints: 0,
                max_audio_duration_seconds: None,
            },
        };
        let answer = submission(
            StudentAnswer::Text {
                value: "I work in the morning and study English.".into(),
            },
            110,
        );
        let output = RubricEvaluationOutput {
            rubric_code: "writing-a1".into(),
            rubric_version: 2,
            criterion_scores: vec![
                RubricCriterionScore {
                    criterion_code: "task".into(),
                    earned_points: 5,
                    feedback: "The response addresses the prompt.".into(),
                },
                RubricCriterionScore {
                    criterion_code: "grammar".into(),
                    earned_points: 3,
                    feedback: "Basic sentence forms are mostly controlled.".into(),
                },
            ],
            summary: "A clear response for the target level.".into(),
            explanation: "The response fulfils the task with a few language errors.".into(),
        };
        activity.validate().unwrap();
        let result = apply_rubric_evaluation(&activity, &answer, output.clone()).unwrap();
        assert_eq!(result.score.unwrap().earned_points, 8);
        assert_eq!(result.skill_measurements.len(), 2);

        let mut invalid_version = output.clone();
        invalid_version.rubric_version = 1;
        assert!(apply_rubric_evaluation(&activity, &answer, invalid_version).is_err());

        let mut duplicate_criterion = output.clone();
        duplicate_criterion.criterion_scores[1].criterion_code = "task".into();
        assert!(apply_rubric_evaluation(&activity, &answer, duplicate_criterion).is_err());

        let mut excessive_points = output.clone();
        excessive_points.criterion_scores[0].earned_points = 7;
        assert!(apply_rubric_evaluation(&activity, &answer, excessive_points).is_err());

        let mut unknown_criterion = output;
        unknown_criterion.criterion_scores[0].criterion_code = "invented".into();
        assert!(apply_rubric_evaluation(&activity, &answer, unknown_criterion).is_err());
    }
}
