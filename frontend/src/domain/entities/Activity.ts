export const ACTIVITY_SCHEMA_VERSION = '1.0' as const

export type ActivityCefrLevel = 'PRE_A1' | 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'
export type ActivityModality = 'written' | 'spoken' | 'listening' | 'practice'
export type ActivitySkill =
  | 'vocabulary'
  | 'grammar'
  | 'listening'
  | 'reading'
  | 'writing'
  | 'speaking'
  | 'interaction'
  | 'mediation'
  | 'phonology'

export interface ActivityLimits {
  timeLimitSeconds: number | null
  maxAttempts: number
  maxHints: number
  maxAudioDurationSeconds: number | null
}

export interface ActivityOption {
  optionId: string
  text: string
}

export interface StudentChoiceQuestion {
  questionId: string
  prompt: string
  options: ActivityOption[]
  allowMultiple: boolean
}

export type StudentStimulus =
  | { kind: 'text'; text: string }
  | { kind: 'audio'; assetId: string }
  | { kind: 'image'; assetId: string }
  | { kind: 'text_and_audio'; text: string; audioAssetId: string }

export type StudentExercise =
  | { type: 'multiple_choice'; prompt: string; options: ActivityOption[]; allowMultiple: boolean }
  | { type: 'translation'; prompt: string; sourceText: string; direction: 'english_to_spanish' | 'spanish_to_english' }
  | { type: 'fill_blank'; promptTemplate: string; gapIds: string[] }
  | { type: 'word_order'; prompt: string; tokens: { tokenId: string; text: string }[] }
  | { type: 'matching'; prompt: string; leftItems: { itemId: string; text: string }[]; rightItems: { itemId: string; text: string }[] }
  | { type: 'listening_comprehension'; prompt: string; questions: StudentChoiceQuestion[] }
  | { type: 'dictation'; prompt: string }
  | { type: 'reading_comprehension'; passage: string; questions: StudentChoiceQuestion[] }
  | { type: 'grammar_transformation'; prompt: string; sourceSentence: string }
  | { type: 'error_correction'; prompt: string; sourceSentence: string }
  | { type: 'open_writing'; prompt: string; minWords: number; maxWords: number }
  | { type: 'guided_dialogue'; scenario: string; openingPrompt: string; maxTurns: number }
  | { type: 'vocabulary_recall'; prompt: string; vocabularyWordId: string; direction: 'english_to_spanish' | 'spanish_to_english' }

export interface StudentActivityView {
  schemaVersion: typeof ACTIVITY_SCHEMA_VERSION
  activityId: string
  activityVersion: number
  title: string
  cefrLevel: ActivityCefrLevel
  modality: ActivityModality
  skills: ActivitySkill[]
  instructions: string
  stimulus: StudentStimulus | null
  exercise: StudentExercise
  availableHints: { hintId: string; order: number; title: string }[]
  limits: ActivityLimits
}

export type StudentAnswer =
  | { kind: 'selected_options'; optionIds: string[] }
  | { kind: 'text'; value: string }
  | { kind: 'gap_answers'; answers: { gapId: string; value: string }[] }
  | { kind: 'ordered_tokens'; tokenIds: string[] }
  | { kind: 'matching'; pairs: { leftId: string; rightId: string }[] }
  | { kind: 'question_choices'; answers: { questionId: string; optionIds: string[] }[] }
  | { kind: 'spoken_audio'; audioUploadId: string; audioDurationMs: number; transcript: string | null }

export interface ActivitySubmission {
  schemaVersion: typeof ACTIVITY_SCHEMA_VERSION
  activityId: string
  activityVersion: number
  idempotencyKey: string
  answer: StudentAnswer
  hintsUsed: string[]
  activeDurationMs: number
}


export type ActivityAttemptState = 'evaluated' | 'pending_review' | 'not_measured'
export type MeasurementState = 'measured' | 'not_measured'

export interface RevealedHint {
  hintId: string
  order: number
  title: string
  body: string
}

export interface ActivityErrorPatternFeedback {
  code: string
  label: string
  remediation: string
  occurrences: number
  recurring: boolean
}

export interface ActivityAttemptResult {
  schemaVersion: typeof ACTIVITY_SCHEMA_VERSION
  attemptId: string
  activityId: string
  activityVersion: number
  state: ActivityAttemptState
  score: {
    earnedPoints: number
    maxPoints: number
    normalizedScore: number
    partialCreditAwarded: boolean
  } | null
  skillMeasurements: {
    skill: ActivitySkill
    state: MeasurementState
    score: number | null
  }[]
  feedback: {
    summary: string
    explanation: string | null
    revealedAnswer: string | null
    equivalentExamples: string[]
    detailedExplanation: string | null
    errorPattern: ActivityErrorPatternFeedback | null
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PRIVATE_FIELDS = new Set([
  'correctOptionIds',
  'correct_option_ids',
  'acceptedAnswers',
  'accepted_answers',
  'acceptedTranscripts',
  'accepted_transcripts',
  'expectedTokenOrder',
  'expected_token_order',
  'correctPairs',
  'correct_pairs',
  'evaluation',
  'rubric',
  'criteria',
  'penaltyPoints',
  'penalty_points',
  'transcriptPolicy',
  'transcript_policy',
  'answerKey',
  'answer_key',
  'feedback',
  'feedbackPolicy',
  'correctExplanation',
  'correct_explanation',
  'incorrectExplanation',
  'incorrect_explanation',
  'detailedExplanation',
  'detailed_explanation',
  'equivalentExamples',
  'equivalent_examples',
  'errorPattern',
  'error_pattern',
])

type JsonRecord = Record<string, unknown>

function fail(path: string, reason: string): never {
  throw new Error('Actividad inválida en ' + path + ': ' + reason)
}

function record(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'se esperaba un objeto')
  }
  return value as JsonRecord
}

function text(value: unknown, path: string, max = 12000): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) {
    return fail(path, 'se esperaba texto no vacío de hasta ' + max + ' caracteres')
  }
  return value
}

function uuid(value: unknown, path: string): string {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    return fail(path, 'se esperaba un UUID')
  }
  return value
}

function list(value: unknown, path: string, min = 1, max = 100): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return fail(path, 'se esperaba una lista de ' + min + ' a ' + max + ' elementos')
  }
  return value
}

function unique(values: string[], path: string): void {
  if (new Set(values).size !== values.length) fail(path, 'contiene identificadores duplicados')
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'se esperaba un booleano')
  return value
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    return fail(path, 'debe ser un entero entre ' + min + ' y ' + max)
  }
  return value as number
}

function assertNoPrivateFields(value: unknown, path = 'activity'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrivateFields(item, path + '[' + index + ']'))
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [key, child] of Object.entries(value)) {
    if (PRIVATE_FIELDS.has(key)) fail(path + '.' + key, 'el servidor incluyó datos editoriales privados')
    assertNoPrivateFields(child, path + '.' + key)
  }
}

function parseOptions(value: unknown, path: string): ActivityOption[] {
  const options = list(value, path, 2, 8).map((item, index) => {
    const option = record(item, path + '[' + index + ']')
    return {
      optionId: uuid(option.optionId, path + '[' + index + '].optionId'),
      text: text(option.text, path + '[' + index + '].text', 500),
    }
  })
  unique(options.map((option) => option.optionId), path + '.optionId')
  return options
}

function parseQuestions(value: unknown, path: string): StudentChoiceQuestion[] {
  const questions = list(value, path, 1, 20).map((item, index) => {
    const question = record(item, path + '[' + index + ']')
    return {
      questionId: uuid(question.questionId, path + '[' + index + '].questionId'),
      prompt: text(question.prompt, path + '[' + index + '].prompt', 1000),
      options: parseOptions(question.options, path + '[' + index + '].options'),
      allowMultiple: boolean(question.allowMultiple, path + '[' + index + '].allowMultiple'),
    }
  })
  unique(questions.map((question) => question.questionId), path + '.questionId')
  return questions
}

function parseStimulus(value: unknown): StudentStimulus | null {
  if (value === null || value === undefined) return null
  const stimulus = record(value, 'stimulus')
  switch (stimulus.kind) {
    case 'text':
      return { kind: 'text', text: text(stimulus.text, 'stimulus.text') }
    case 'audio':
      return { kind: 'audio', assetId: uuid(stimulus.assetId, 'stimulus.assetId') }
    case 'image':
      return { kind: 'image', assetId: uuid(stimulus.assetId, 'stimulus.assetId') }
    case 'text_and_audio':
      return {
        kind: 'text_and_audio',
        text: text(stimulus.text, 'stimulus.text'),
        audioAssetId: uuid(stimulus.audioAssetId, 'stimulus.audioAssetId'),
      }
    default:
      return fail('stimulus.kind', 'tipo de estímulo no soportado')
  }
}

function parseExercise(value: unknown): StudentExercise {
  const exercise = record(value, 'exercise')
  switch (exercise.type) {
    case 'multiple_choice':
      return {
        type: 'multiple_choice',
        prompt: text(exercise.prompt, 'exercise.prompt', 1000),
        options: parseOptions(exercise.options, 'exercise.options'),
        allowMultiple: boolean(exercise.allowMultiple, 'exercise.allowMultiple'),
      }
    case 'translation':
      if (exercise.direction !== 'english_to_spanish' && exercise.direction !== 'spanish_to_english') {
        return fail('exercise.direction', 'dirección de traducción no soportada')
      }
      return {
        type: 'translation',
        prompt: text(exercise.prompt, 'exercise.prompt', 1000),
        sourceText: text(exercise.sourceText, 'exercise.sourceText', 1000),
        direction: exercise.direction,
      }
    case 'fill_blank': {
      const promptTemplate = text(exercise.promptTemplate, 'exercise.promptTemplate', 2000)
      const gapIds = list(exercise.gapIds, 'exercise.gapIds', 1, 20).map((id, index) => uuid(id, 'exercise.gapIds[' + index + ']'))
      unique(gapIds, 'exercise.gapIds')
      const markers = Array.from(promptTemplate.matchAll(/\{\{([0-9a-f-]{36})\}\}/gi), (match) => match[1].toLowerCase())
      if (markers.length !== gapIds.length || /\{\{/.test(promptTemplate.replace(/\{\{[0-9a-f-]{36}\}\}/gi, ''))) {
        fail('exercise.promptTemplate', 'debe contener exactamente un marcador válido por espacio')
      }
      unique(markers, 'exercise.promptTemplate')
      if (gapIds.some((gapId) => !markers.includes(gapId.toLowerCase()))) {
        fail('exercise.promptTemplate', 'todos los espacios declarados deben tener un marcador')
      }
      return { type: 'fill_blank', promptTemplate, gapIds }
    }
    case 'word_order': {
      const tokens = list(exercise.tokens, 'exercise.tokens', 2, 30).map((item, index) => {
        const token = record(item, 'exercise.tokens[' + index + ']')
        return {
          tokenId: uuid(token.tokenId, 'exercise.tokens[' + index + '].tokenId'),
          text: text(token.text, 'exercise.tokens[' + index + '].text', 80),
        }
      })
      unique(tokens.map((token) => token.tokenId), 'exercise.tokens')
      return { type: 'word_order', prompt: text(exercise.prompt, 'exercise.prompt', 1000), tokens }
    }
    case 'matching': {
      const leftItems = list(exercise.leftItems, 'exercise.leftItems', 2, 20).map((item, index) => {
        const match = record(item, 'exercise.leftItems[' + index + ']')
        return { itemId: uuid(match.itemId, 'exercise.leftItems[' + index + '].itemId'), text: text(match.text, 'exercise.leftItems[' + index + '].text', 240) }
      })
      const rightItems = list(exercise.rightItems, 'exercise.rightItems', 2, 20).map((item, index) => {
        const match = record(item, 'exercise.rightItems[' + index + ']')
        return { itemId: uuid(match.itemId, 'exercise.rightItems[' + index + '].itemId'), text: text(match.text, 'exercise.rightItems[' + index + '].text', 240) }
      })
      unique(leftItems.map((item) => item.itemId), 'exercise.leftItems')
      unique(rightItems.map((item) => item.itemId), 'exercise.rightItems')
      if (leftItems.some((item) => rightItems.some((right) => right.itemId === item.itemId))) {
        fail('exercise.matching', 'los identificadores de ambos lados deben ser independientes')
      }
      return { type: 'matching', prompt: text(exercise.prompt, 'exercise.prompt', 1000), leftItems, rightItems }
    }
    case 'listening_comprehension':
      return {
        type: 'listening_comprehension',
        prompt: text(exercise.prompt, 'exercise.prompt', 1000),
        questions: parseQuestions(exercise.questions, 'exercise.questions'),
      }
    case 'dictation':
      return { type: 'dictation', prompt: text(exercise.prompt, 'exercise.prompt', 1000) }
    case 'reading_comprehension':
      return {
        type: 'reading_comprehension',
        passage: text(exercise.passage, 'exercise.passage', 12000),
        questions: parseQuestions(exercise.questions, 'exercise.questions'),
      }
    case 'grammar_transformation':
      return {
        type: 'grammar_transformation',
        prompt: text(exercise.prompt, 'exercise.prompt', 1000),
        sourceSentence: text(exercise.sourceSentence, 'exercise.sourceSentence', 1000),
      }
    case 'error_correction':
      return {
        type: 'error_correction',
        prompt: text(exercise.prompt, 'exercise.prompt', 1000),
        sourceSentence: text(exercise.sourceSentence, 'exercise.sourceSentence', 1000),
      }
    case 'open_writing': {
      const minWords = integer(exercise.minWords, 'exercise.minWords', 1, 1500)
      const maxWords = integer(exercise.maxWords, 'exercise.maxWords', minWords, 1500)
      return { type: 'open_writing', prompt: text(exercise.prompt, 'exercise.prompt', 2000), minWords, maxWords }
    }
    case 'guided_dialogue':
      return {
        type: 'guided_dialogue',
        scenario: text(exercise.scenario, 'exercise.scenario', 2000),
        openingPrompt: text(exercise.openingPrompt, 'exercise.openingPrompt', 1000),
        maxTurns: integer(exercise.maxTurns, 'exercise.maxTurns', 2, 20),
      }
    case 'vocabulary_recall':
      if (exercise.direction !== 'english_to_spanish' && exercise.direction !== 'spanish_to_english') {
        return fail('exercise.direction', 'dirección de recuperación no soportada')
      }
      return {
        type: 'vocabulary_recall',
        prompt: text(exercise.prompt, 'exercise.prompt', 1000),
        vocabularyWordId: uuid(exercise.vocabularyWordId, 'exercise.vocabularyWordId'),
        direction: exercise.direction,
      }
    default:
      return fail('exercise.type', 'tipo de ejercicio no soportado')
  }
}

export function parseStudentActivityView(value: unknown): StudentActivityView {
  assertNoPrivateFields(value)
  const activity = record(value, 'activity')
  if (activity.schemaVersion !== ACTIVITY_SCHEMA_VERSION) {
    fail('schemaVersion', 'versión de contrato no soportada')
  }
  const cefrLevels: ActivityCefrLevel[] = ['PRE_A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']
  const modalities: ActivityModality[] = ['written', 'spoken', 'listening', 'practice']
  if (!cefrLevels.includes(activity.cefrLevel as ActivityCefrLevel)) fail('cefrLevel', 'nivel no soportado')
  if (!modalities.includes(activity.modality as ActivityModality)) fail('modality', 'modalidad no soportada')
  const skills = list(activity.skills, 'skills', 1, 9).map((skill, index) => {
    const allowed: ActivitySkill[] = ['vocabulary', 'grammar', 'listening', 'reading', 'writing', 'speaking', 'interaction', 'mediation', 'phonology']
    if (!allowed.includes(skill as ActivitySkill)) fail('skills[' + index + ']', 'competencia no soportada')
    return skill as ActivitySkill
  })
  unique(skills, 'skills')

  const limitsValue = record(activity.limits, 'limits')
  const timeLimitSeconds = limitsValue.timeLimitSeconds === null ? null : integer(limitsValue.timeLimitSeconds, 'limits.timeLimitSeconds', 5, 7200)
  const maxAudioDurationSeconds = limitsValue.maxAudioDurationSeconds === null
    ? null
    : integer(limitsValue.maxAudioDurationSeconds, 'limits.maxAudioDurationSeconds', 1, 600)
  const limits: ActivityLimits = {
    timeLimitSeconds,
    maxAttempts: integer(limitsValue.maxAttempts, 'limits.maxAttempts', 1, 10),
    maxHints: integer(limitsValue.maxHints, 'limits.maxHints', 0, 8),
    maxAudioDurationSeconds,
  }
  if (limits.maxHints > 0 && activity.availableHints === undefined) fail('availableHints', 'faltan pistas')
  if (activity.modality === 'spoken' && maxAudioDurationSeconds === null) fail('limits.maxAudioDurationSeconds', 'la modalidad hablada requiere límite de audio')

  const availableHints = (activity.availableHints === undefined ? [] : list(activity.availableHints, 'availableHints', 0, 8)).map((item, index) => {
    const hint = record(item, 'availableHints[' + index + ']')
    return {
      hintId: uuid(hint.hintId, 'availableHints[' + index + '].hintId'),
      order: integer(hint.order, 'availableHints[' + index + '].order', 1, 255),
      title: text(hint.title, 'availableHints[' + index + '].title', 100),
    }
  })
  unique(availableHints.map((hint) => hint.hintId), 'availableHints.hintId')
  if (limits.maxHints > availableHints.length) fail('limits.maxHints', 'supera las pistas disponibles')

  const result: StudentActivityView = {
    schemaVersion: ACTIVITY_SCHEMA_VERSION,
    activityId: uuid(activity.activityId, 'activityId'),
    activityVersion: integer(activity.activityVersion, 'activityVersion', 1, 2147483647),
    title: text(activity.title, 'title', 160),
    cefrLevel: activity.cefrLevel as ActivityCefrLevel,
    modality: activity.modality as ActivityModality,
    skills,
    instructions: text(activity.instructions, 'instructions', 2000),
    stimulus: parseStimulus(activity.stimulus),
    exercise: parseExercise(activity.exercise),
    availableHints,
    limits,
  }
  if (result.exercise.type === 'listening_comprehension' || result.exercise.type === 'dictation') {
    if (!result.stimulus || (result.stimulus.kind !== 'audio' && result.stimulus.kind !== 'text_and_audio')) {
      fail('stimulus', 'el ejercicio de listening requiere un estímulo de audio')
    }
    if (result.stimulus.kind === 'text_and_audio') fail('stimulus', 'listening no puede revelar el texto antes de responder')
  }
  if (result.exercise.type === 'guided_dialogue' && result.modality !== 'spoken') {
    fail('modality', 'el diálogo guiado requiere modalidad hablada')
  }
  if ((result.exercise.type === 'listening_comprehension' || result.exercise.type === 'dictation') && result.modality !== 'listening') {
    fail('modality', 'la comprensión auditiva y el dictado requieren modalidad listening')
  }
  if (result.exercise.type === 'reading_comprehension' && result.modality !== 'written') {
    fail('modality', 'la comprensión lectora requiere modalidad escrita')
  }
  if (result.exercise.type === 'vocabulary_recall' && result.modality !== 'practice') {
    fail('modality', 'la recuperación de vocabulario requiere modalidad practice')
  }
  if (result.exercise.type === 'open_writing' && !result.skills.includes('writing')) {
    fail('skills', 'la escritura abierta requiere competencia writing')
  }
  if (result.modality === 'listening' && !result.skills.includes('listening')) {
    fail('skills', 'la modalidad listening requiere competencia listening')
  }
  if (result.modality === 'spoken' && (!result.skills.includes('speaking') || result.exercise.type !== 'guided_dialogue')) {
    fail('modality', 'la modalidad hablada requiere diálogo guiado y competencia speaking')
  }
  if (result.modality === 'practice' && result.exercise.type !== 'vocabulary_recall') {
    fail('modality', 'la modalidad practice se reserva para recuperación de vocabulario')
  }
  if (result.modality === 'written' && (
    result.skills.includes('speaking')
    || result.skills.includes('listening')
    || result.exercise.type === 'guided_dialogue'
    || result.exercise.type === 'vocabulary_recall'
  )) {
    fail('skills', 'la modalidad escrita no puede incluir competencias o familias incompatibles')
  }
  return result
}


export function parseRevealedHint(value: unknown): RevealedHint {
  const hint = record(value, 'revealedHint')
  return {
    hintId: uuid(hint.hintId, 'revealedHint.hintId'),
    order: integer(hint.order, 'revealedHint.order', 1, 8),
    title: text(hint.title, 'revealedHint.title', 100),
    body: text(hint.body, 'revealedHint.body', 1000),
  }
}

export function parseActivityAttemptResult(
  value: unknown,
  activity: StudentActivityView,
): ActivityAttemptResult {
  const result = record(value, 'result')
  if (result.schemaVersion !== ACTIVITY_SCHEMA_VERSION) fail('result.schemaVersion', 'versión no soportada')
  const activityId = uuid(result.activityId, 'result.activityId')
  const activityVersion = integer(result.activityVersion, 'result.activityVersion', 1, 2147483647)
  if (activityId !== activity.activityId || activityVersion !== activity.activityVersion) {
    fail('result.activityVersion', 'el resultado pertenece a otra actividad o versión')
  }
  const attemptId = uuid(result.attemptId, 'result.attemptId')
  if (result.state !== 'evaluated' && result.state !== 'pending_review' && result.state !== 'not_measured') {
    fail('result.state', 'estado de intento desconocido')
  }

  let score: ActivityAttemptResult['score'] = null
  if (result.state === 'evaluated') {
    const value = record(result.score, 'result.score')
    const earnedPoints = integer(value.earnedPoints, 'result.score.earnedPoints', 0, 65535)
    const maxPoints = integer(value.maxPoints, 'result.score.maxPoints', 1, 65535)
    if (earnedPoints > maxPoints) fail('result.score.earnedPoints', 'supera el máximo de puntos')
    if (typeof value.normalizedScore !== 'number' || !Number.isFinite(value.normalizedScore) || value.normalizedScore < 0 || value.normalizedScore > 100) {
      fail('result.score.normalizedScore', 'debe estar entre 0 y 100')
    }
    score = {
      earnedPoints,
      maxPoints,
      normalizedScore: value.normalizedScore,
      partialCreditAwarded: boolean(value.partialCreditAwarded, 'result.score.partialCreditAwarded'),
    }
  } else if (result.score !== null) {
    fail('result.score', 'los intentos sin evaluación no pueden incluir puntuación')
  }

  const allowedSkills: ActivitySkill[] = ['vocabulary', 'grammar', 'listening', 'reading', 'writing', 'speaking', 'interaction', 'mediation', 'phonology']
  const measurements = result.skillMeasurements === undefined
    ? []
    : list(result.skillMeasurements, 'result.skillMeasurements', 0, 9).map((item, index) => {
      const measurement = record(item, 'result.skillMeasurements[' + index + ']')
      if (!allowedSkills.includes(measurement.skill as ActivitySkill)) fail('result.skillMeasurements.skill', 'competencia desconocida')
      if (measurement.state !== 'measured' && measurement.state !== 'not_measured') fail('result.skillMeasurements.state', 'estado de medición desconocido')
      if (measurement.state === 'measured') {
        if (typeof measurement.score !== 'number' || !Number.isFinite(measurement.score) || measurement.score < 0 || measurement.score > 100) {
          fail('result.skillMeasurements.score', 'una medición válida requiere score entre 0 y 100')
        }
      } else if (measurement.score !== null) {
        fail('result.skillMeasurements.score', 'una competencia no medida debe tener score null')
      }
      return {
        skill: measurement.skill as ActivitySkill,
        state: measurement.state as MeasurementState,
        score: measurement.score as number | null,
      }
    })
  unique(measurements.map((measurement) => measurement.skill), 'result.skillMeasurements.skill')

  const feedback = record(result.feedback, 'result.feedback')
  const optionalText = (input: unknown, path: string, max: number) =>
    input === null || input === undefined ? null : text(input, path, max)
  const equivalentExamples = feedback.equivalentExamples === undefined
    ? []
    : list(feedback.equivalentExamples, 'result.feedback.equivalentExamples', 0, 5)
      .map((example, index) => text(example, 'result.feedback.equivalentExamples[' + index + ']', 500))
  unique(equivalentExamples, 'result.feedback.equivalentExamples')
  const errorPattern = feedback.errorPattern == null
    ? null
    : (() => {
      const pattern = record(feedback.errorPattern, 'result.feedback.errorPattern')
      const occurrences = integer(pattern.occurrences, 'result.feedback.errorPattern.occurrences', 0, 1_000_000)
      const recurring = boolean(pattern.recurring, 'result.feedback.errorPattern.recurring')
      if (recurring !== (occurrences >= 3)) {
        fail('result.feedback.errorPattern.recurring', 'debe corresponder a tres o más apariciones')
      }
      const code = text(pattern.code, 'result.feedback.errorPattern.code', 80)
      if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(code)) {
        fail('result.feedback.errorPattern.code', 'formato de código no válido')
      }
      return {
        code,
        label: text(pattern.label, 'result.feedback.errorPattern.label', 120),
        remediation: text(pattern.remediation, 'result.feedback.errorPattern.remediation', 1000),
        occurrences,
        recurring,
      }
    })()

  return {
    schemaVersion: ACTIVITY_SCHEMA_VERSION,
    attemptId,
    activityId,
    activityVersion,
    state: result.state,
    score,
    skillMeasurements: measurements,
    feedback: {
      summary: text(feedback.summary, 'result.feedback.summary', 1000),
      explanation: optionalText(feedback.explanation, 'result.feedback.explanation', 4000),
      revealedAnswer: optionalText(feedback.revealedAnswer, 'result.feedback.revealedAnswer', 4000),
      equivalentExamples,
      detailedExplanation: optionalText(feedback.detailedExplanation, 'result.feedback.detailedExplanation', 4000),
      errorPattern,
    },
  }
}

export function isStudentAnswerComplete(activity: StudentActivityView, answer: StudentAnswer): boolean {
  const containsUniqueStrings = (items: string[]) => new Set(items).size === items.length
  switch (activity.exercise.type) {
    case 'multiple_choice':
      return answer.kind === 'selected_options'
        && answer.optionIds.length > 0
        && (activity.exercise.allowMultiple || answer.optionIds.length === 1)
        && containsUniqueStrings(answer.optionIds)
        && answer.optionIds.every((id) => activity.exercise.type === 'multiple_choice' && activity.exercise.options.some((option) => option.optionId === id))
    case 'translation':
    case 'dictation':
    case 'grammar_transformation':
    case 'error_correction':
    case 'vocabulary_recall':
      return answer.kind === 'text' && answer.value.trim().length > 0 && answer.value.length <= 5000
    case 'fill_blank':
      return answer.kind === 'gap_answers'
        && answer.answers.length === activity.exercise.gapIds.length
        && containsUniqueStrings(answer.answers.map((item) => item.gapId))
        && activity.exercise.gapIds.every((id) => answer.kind === 'gap_answers' && answer.answers.some((item) => item.gapId === id && item.value.trim().length > 0 && item.value.length <= 500))
    case 'word_order':
      return answer.kind === 'ordered_tokens'
        && answer.tokenIds.length === activity.exercise.tokens.length
        && containsUniqueStrings(answer.tokenIds)
        && activity.exercise.tokens.every((token) => answer.kind === 'ordered_tokens' && answer.tokenIds.includes(token.tokenId))
    case 'matching':
      return answer.kind === 'matching'
        && answer.pairs.length === activity.exercise.leftItems.length
        && containsUniqueStrings(answer.pairs.map((pair) => pair.leftId))
        && containsUniqueStrings(answer.pairs.map((pair) => pair.rightId))
        && activity.exercise.leftItems.every((item) => answer.kind === 'matching' && answer.pairs.some((pair) => pair.leftId === item.itemId && activity.exercise.type === 'matching' && activity.exercise.rightItems.some((right) => right.itemId === pair.rightId)))
    case 'listening_comprehension':
    case 'reading_comprehension':
      return answer.kind === 'question_choices'
        && answer.answers.length === activity.exercise.questions.length
        && containsUniqueStrings(answer.answers.map((item) => item.questionId))
        && activity.exercise.questions.every((question) => answer.kind === 'question_choices' && answer.answers.some((item) =>
          item.questionId === question.questionId
          && item.optionIds.length > 0
          && containsUniqueStrings(item.optionIds)
          && (question.allowMultiple || item.optionIds.length === 1)
          && item.optionIds.every((id) => question.options.some((option) => option.optionId === id)),
        ))
    case 'open_writing': {
      if (answer.kind !== 'text') return false
      const words = answer.value.trim().split(/\s+/).filter(Boolean).length
      return answer.value.length <= 12000 && words >= activity.exercise.minWords && words <= activity.exercise.maxWords
    }
    case 'guided_dialogue':
      return activity.modality === 'spoken'
        && answer.kind === 'spoken_audio'
        && UUID_PATTERN.test(answer.audioUploadId)
        && Number.isSafeInteger(answer.audioDurationMs)
        && answer.audioDurationMs > 0
        && activity.limits.maxAudioDurationSeconds !== null
        && answer.audioDurationMs <= activity.limits.maxAudioDurationSeconds * 1000
    default:
      return false
  }
}

export function buildActivitySubmission(
  activity: StudentActivityView,
  answer: StudentAnswer,
  idempotencyKey: string,
  activeDurationMs: number,
  hintsUsed: string[] = [],
): ActivitySubmission {
  if (!UUID_PATTERN.test(idempotencyKey)) throw new Error('La clave de idempotencia debe ser un UUID.')
  if (!Number.isSafeInteger(activeDurationMs) || activeDurationMs < 1 || activeDurationMs > 12 * 60 * 60 * 1000) {
    throw new Error('La duración activa debe estar entre 1 ms y 12 horas.')
  }
  if (activity.limits.timeLimitSeconds !== null && activeDurationMs > activity.limits.timeLimitSeconds * 1000) {
    throw new Error('Se superó el tiempo máximo permitido para la actividad.')
  }
  unique(hintsUsed, 'hintsUsed')
  const allowedHints = new Set(activity.availableHints.slice(0, activity.limits.maxHints).map((hint) => hint.hintId))
  if (hintsUsed.length > activity.limits.maxHints || hintsUsed.some((id) => !allowedHints.has(id))) {
    throw new Error('El envío contiene pistas no disponibles.')
  }
  if (!isStudentAnswerComplete(activity, answer)) {
    throw new Error('Completa la actividad antes de enviarla.')
  }
  return {
    schemaVersion: ACTIVITY_SCHEMA_VERSION,
    activityId: activity.activityId,
    activityVersion: activity.activityVersion,
    idempotencyKey,
    answer,
    hintsUsed,
    activeDurationMs,
  }
}
