import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildActivitySubmission,
  isStudentAnswerComplete,
  parseActivityAttemptResult,
  parseStudentActivityView,
} from '../../src/domain/entities/Activity.ts'

const uuid = (value) => '00000000-0000-4000-8000-' + String(value).padStart(12, '0')
const base = {
  schemaVersion: '1.0',
  activityId: uuid(1),
  activityVersion: 1,
  title: 'Practice activity',
  cefrLevel: 'A1',
  modality: 'written',
  skills: ['vocabulary'],
  instructions: 'Read the instruction and answer.',
  stimulus: null,
  availableHints: [],
  limits: {
    timeLimitSeconds: 120,
    maxAttempts: 2,
    maxHints: 0,
    maxAudioDurationSeconds: null,
  },
}

const option = (id, text) => ({ optionId: uuid(id), text })
const question = (id) => ({
  questionId: uuid(id),
  prompt: 'What is the correct answer?',
  options: [option(id + 1, 'A'), option(id + 2, 'B')],
  allowMultiple: false,
})

const cases = [
  {
    name: 'multiple choice',
    exercise: { type: 'multiple_choice', prompt: 'Choose one.', options: [option(10, 'Hello'), option(11, 'Goodbye')], allowMultiple: false },
  },
  {
    name: 'translation',
    exercise: { type: 'translation', prompt: 'Translate the phrase.', sourceText: 'Good morning', direction: 'english_to_spanish' },
  },
  {
    name: 'fill blank',
    exercise: { type: 'fill_blank', promptTemplate: 'My name is {{' + uuid(20) + '}}.', gapIds: [uuid(20)] },
  },
  {
    name: 'word order',
    exercise: { type: 'word_order', prompt: 'Build a sentence.', tokens: [{ tokenId: uuid(30), text: 'I' }, { tokenId: uuid(31), text: 'learn' }] },
  },
  {
    name: 'matching',
    exercise: { type: 'matching', prompt: 'Match each item.', leftItems: [{ itemId: uuid(40), text: 'Hello' }, { itemId: uuid(41), text: 'Goodbye' }], rightItems: [{ itemId: uuid(42), text: 'Hola' }, { itemId: uuid(43), text: 'Adiós' }] },
  },
  {
    name: 'listening comprehension',
    modality: 'listening',
    skills: ['listening'],
    stimulus: { kind: 'audio', assetId: uuid(50) },
    exercise: { type: 'listening_comprehension', prompt: 'Listen and answer.', questions: [question(51)] },
  },
  {
    name: 'dictation',
    modality: 'listening',
    skills: ['listening'],
    stimulus: { kind: 'audio', assetId: uuid(60) },
    exercise: { type: 'dictation', prompt: 'Write what you hear.' },
  },
  {
    name: 'reading comprehension',
    modality: 'written',
    skills: ['reading'],
    stimulus: { kind: 'text', text: 'A short reading passage.' },
    exercise: { type: 'reading_comprehension', passage: 'A short reading passage.', questions: [question(61)] },
  },
  {
    name: 'grammar transformation',
    exercise: { type: 'grammar_transformation', prompt: 'Change to past tense.', sourceSentence: 'I work every day.' },
  },
  {
    name: 'error correction',
    exercise: { type: 'error_correction', prompt: 'Correct the sentence.', sourceSentence: 'She go to school.' },
  },
  {
    name: 'open writing',
    skills: ['writing'],
    exercise: { type: 'open_writing', prompt: 'Write about your routine.', minWords: 3, maxWords: 60 },
  },
  {
    name: 'guided dialogue',
    modality: 'spoken',
    skills: ['speaking', 'interaction'],
    limits: { ...base.limits, timeLimitSeconds: 300, maxAudioDurationSeconds: 90 },
    exercise: { type: 'guided_dialogue', scenario: 'You are meeting a colleague.', openingPrompt: 'Tell me about your role.', maxTurns: 4 },
  },
  {
    name: 'vocabulary recall',
    modality: 'practice',
    skills: ['vocabulary'],
    limits: { ...base.limits, timeLimitSeconds: null },
    exercise: { type: 'vocabulary_recall', prompt: 'Recall the meaning.', vocabularyWordId: uuid(70), direction: 'english_to_spanish' },
  },
]

function activityFor(item) {
  return parseStudentActivityView({
    ...base,
    modality: item.modality ?? base.modality,
    skills: item.skills ?? base.skills,
    stimulus: item.stimulus ?? base.stimulus,
    limits: item.limits ?? base.limits,
    exercise: item.exercise,
  })
}

test('the student parser accepts all thirteen versioned exercise views', () => {
  assert.equal(cases.length, 13)
  for (const item of cases) {
    const activity = activityFor(item)
    assert.equal(activity.exercise.type, item.exercise.type, item.name)
  }
})

test('student projection rejects private answer keys and rubrics at any nesting level', () => {
  const unsafe = {
    ...base,
    exercise: {
      type: 'multiple_choice',
      prompt: 'Choose one.',
      options: [option(10, 'A'), option(11, 'B')],
      allowMultiple: false,
      correctOptionIds: [uuid(10)],
    },
  }
  assert.throws(() => parseStudentActivityView(unsafe), /datos editoriales privados/)
  assert.throws(() => parseStudentActivityView({
    ...base,
    exercise: cases[0].exercise,
    metadata: { rubric: { criteria: [] } },
  }), /datos editoriales privados/)
})

test('student parser rejects listening activities that reveal a transcript', () => {
  assert.throws(() => activityFor({
    ...cases[5],
    stimulus: { kind: 'text_and_audio', text: 'The hidden transcript', audioAssetId: uuid(52) },
  }), /no puede revelar el texto/)
})

test('fill blank requires one exact marker for every gap ID', () => {
  assert.throws(() => parseStudentActivityView({
    ...base,
    exercise: { type: 'fill_blank', promptTemplate: 'Name: {{' + uuid(20) + '}} and {{' + uuid(20) + '}}', gapIds: [uuid(20)] },
  }), /exactamente un marcador válido por espacio/)
})

test('multiple-choice submission is versioned, typed, idempotent and bounded', () => {
  const activity = activityFor(cases[0])
  const answer = { kind: 'selected_options', optionIds: [uuid(10)] }
  assert.equal(isStudentAnswerComplete(activity, answer), true)
  const submission = buildActivitySubmission(activity, answer, uuid(90), 12000)
  assert.equal(submission.schemaVersion, '1.0')
  assert.equal(submission.activityId, activity.activityId)
  assert.equal(submission.activityVersion, 1)
  assert.equal(submission.idempotencyKey, uuid(90))
  assert.deepEqual(submission.answer, answer)
  assert.equal(submission.activeDurationMs, 12000)
})

test('incomplete, foreign and over-time answers cannot be submitted', () => {
  const activity = activityFor(cases[0])
  assert.equal(isStudentAnswerComplete(activity, { kind: 'selected_options', optionIds: [] }), false)
  assert.throws(() => buildActivitySubmission(activity, { kind: 'selected_options', optionIds: [] }, uuid(90), 1000), /Completa/)
  assert.throws(() => buildActivitySubmission(activity, { kind: 'selected_options', optionIds: [uuid(99)] }, uuid(90), 1000), /Completa/)
  assert.throws(() => buildActivitySubmission(activity, { kind: 'selected_options', optionIds: [uuid(10)] }, uuid(90), 121000), /tiempo máximo/)
})

test('word-order and matching answers require all source identifiers exactly once', () => {
  const wordOrder = activityFor(cases[3])
  assert.equal(isStudentAnswerComplete(wordOrder, { kind: 'ordered_tokens', tokenIds: [uuid(30), uuid(31)] }), true)
  assert.equal(isStudentAnswerComplete(wordOrder, { kind: 'ordered_tokens', tokenIds: [uuid(30), uuid(30)] }), false)

  const matching = activityFor(cases[4])
  assert.equal(isStudentAnswerComplete(matching, {
    kind: 'matching',
    pairs: [{ leftId: uuid(40), rightId: uuid(42) }, { leftId: uuid(41), rightId: uuid(43) }],
  }), true)
  assert.equal(isStudentAnswerComplete(matching, {
    kind: 'matching',
    pairs: [{ leftId: uuid(40), rightId: uuid(42) }],
  }), false)
})

test('reading and listening require an answer for every question', () => {
  const listening = activityFor(cases[5])
  assert.equal(isStudentAnswerComplete(listening, {
    kind: 'question_choices',
    answers: [{ questionId: uuid(51), optionIds: [uuid(52)] }],
  }), true)
  assert.equal(isStudentAnswerComplete(listening, {
    kind: 'question_choices',
    answers: [],
  }), false)
})

test('open writing enforces its published word-count bounds', () => {
  const writing = activityFor(cases[10])
  assert.equal(isStudentAnswerComplete(writing, { kind: 'text', value: 'I study English every day.' }), true)
  assert.equal(isStudentAnswerComplete(writing, { kind: 'text', value: 'Hello world' }), false)
})

test('spoken dialogue requires a real uploaded recording within the configured limit', () => {
  const spoken = activityFor(cases[11])
  assert.equal(isStudentAnswerComplete(spoken, {
    kind: 'spoken_audio',
    audioUploadId: uuid(80),
    audioDurationMs: 45000,
    transcript: null,
  }), true)
  assert.equal(isStudentAnswerComplete(spoken, {
    kind: 'spoken_audio',
    audioUploadId: uuid(80),
    audioDurationMs: 91000,
    transcript: null,
  }), false)
})


test('every one of the thirteen exercise types produces a complete versioned submission', () => {
  const answers = {
    multiple_choice: { kind: 'selected_options', optionIds: [uuid(10)] },
    translation: { kind: 'text', value: 'Buenos días' },
    fill_blank: { kind: 'gap_answers', answers: [{ gapId: uuid(20), value: 'Kevin' }] },
    word_order: { kind: 'ordered_tokens', tokenIds: [uuid(30), uuid(31)] },
    matching: { kind: 'matching', pairs: [{ leftId: uuid(40), rightId: uuid(42) }, { leftId: uuid(41), rightId: uuid(43) }] },
    listening_comprehension: { kind: 'question_choices', answers: [{ questionId: uuid(51), optionIds: [uuid(52)] }] },
    dictation: { kind: 'text', value: 'The train leaves at nine.' },
    reading_comprehension: { kind: 'question_choices', answers: [{ questionId: uuid(61), optionIds: [uuid(62)] }] },
    grammar_transformation: { kind: 'text', value: 'I worked every day.' },
    error_correction: { kind: 'text', value: 'She goes to school.' },
    open_writing: { kind: 'text', value: 'I study English every day.' },
    guided_dialogue: { kind: 'spoken_audio', audioUploadId: uuid(80), audioDurationMs: 45000, transcript: null },
    vocabulary_recall: { kind: 'text', value: 'Hola' },
  }

  cases.forEach((item, index) => {
    const activity = activityFor(item)
    const answer = answers[item.exercise.type]
    assert.equal(isStudentAnswerComplete(activity, answer), true, item.name)
    const submission = buildActivitySubmission(activity, answer, uuid(900 + index), 5000)
    assert.equal(submission.activityId, activity.activityId, item.name)
    assert.deepEqual(submission.answer, answer, item.name)
  })
})

test('student parser rejects modality and skill claims that contradict the exercise', () => {
  assert.throws(() => activityFor({
    ...cases[5],
    modality: 'written',
    skills: ['reading'],
  }), /modalidad listening/)
  assert.throws(() => activityFor({
    ...cases[10],
    skills: ['vocabulary'],
  }), /competencia writing/)
})

test('submission refuses hidden or excess hints', () => {
  const withHint = parseStudentActivityView({
    ...base,
    availableHints: [{ hintId: uuid(101), order: 1, title: 'Think about the context' }],
    limits: { ...base.limits, maxHints: 1 },
    exercise: cases[0].exercise,
  })
  assert.throws(() => buildActivitySubmission(
    withHint,
    { kind: 'selected_options', optionIds: [uuid(10)] },
    uuid(90),
    1000,
    [uuid(102)],
  ), /pistas no disponibles/)
})


test('authoritative evaluated and pending-review results are version-bound and feedback-safe', () => {
  const activity = activityFor(cases[0])
  const evaluated = parseActivityAttemptResult({
    schemaVersion: '1.0',
    attemptId: uuid(901),
    activityId: activity.activityId,
    activityVersion: activity.activityVersion,
    state: 'evaluated',
    score: {
      earnedPoints: 8,
      maxPoints: 10,
      normalizedScore: 80,
      partialCreditAwarded: true,
    },
    skillMeasurements: [
      { skill: 'vocabulary', state: 'measured', score: 80 },
      { skill: 'speaking', state: 'not_measured', score: null },
    ],
    feedback: {
      summary: 'Good work. Review the contextual meaning.',
      explanation: 'The expression is used when meeting someone.',
      revealedAnswer: 'Nice to meet you',
    },
  }, activity)

  assert.equal(evaluated.state, 'evaluated')
  assert.equal(evaluated.score?.earnedPoints, 8)
  assert.equal(evaluated.feedback.revealedAnswer, 'Nice to meet you')
  assert.equal(evaluated.skillMeasurements[1].score, null)

  const pending = parseActivityAttemptResult({
    schemaVersion: '1.0',
    attemptId: uuid(902),
    activityId: activity.activityId,
    activityVersion: activity.activityVersion,
    state: 'pending_review',
    score: null,
    skillMeasurements: [],
    feedback: {
      summary: 'Your writing is waiting for review.',
      explanation: null,
      revealedAnswer: null,
    },
  }, activity)
  assert.equal(pending.state, 'pending_review')
  assert.equal(pending.score, null)
})

test('result parser rejects stale versions and scores on unmeasured attempts', () => {
  const activity = activityFor(cases[0])
  const baseResult = {
    schemaVersion: '1.0',
    attemptId: uuid(903),
    activityId: activity.activityId,
    activityVersion: activity.activityVersion,
    state: 'pending_review',
    score: null,
    skillMeasurements: [],
    feedback: { summary: 'Pending.', explanation: null, revealedAnswer: null },
  }
  assert.throws(() => parseActivityAttemptResult({
    ...baseResult,
    activityVersion: 2,
  }, activity), /otra actividad o versión/)
  assert.throws(() => parseActivityAttemptResult({
    ...baseResult,
    score: { earnedPoints: 1, maxPoints: 1, normalizedScore: 100, partialCreditAwarded: false },
  }, activity), /no pueden incluir puntuación/)
})


test('fill blank rejects placeholders that are not declared exactly once', () => {
  assert.throws(() => parseStudentActivityView({
    ...base,
    exercise: {
      type: 'fill_blank',
      promptTemplate: 'Name: {{' + uuid(20) + '}} and {{' + uuid(21) + '}}',
      gapIds: [uuid(20)],
    },
  }), /exactamente un marcador válido/)
})

test('student parser enforces listening and speaking skill evidence boundaries', () => {
  assert.throws(() => activityFor({
    ...cases[5],
    skills: ['reading'],
  }), /competencia listening/)
  assert.throws(() => activityFor({
    ...cases[11],
    modality: 'written',
  }), /diálogo guiado requiere modalidad hablada/)
})
