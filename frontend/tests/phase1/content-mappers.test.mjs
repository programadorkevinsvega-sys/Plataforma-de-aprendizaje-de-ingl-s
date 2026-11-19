import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  toComprehensionResource,
  toVocabularyWord,
} from '../../src/infrastructure/api/mappers.ts'

test('published vocabulary maps v2 taxonomy, learning metadata and sentence review state', () => {
  const word = toVocabularyWord({
    id: 'word-deploy',
    word: 'deploy',
    spanish_translation: 'desplegar',
    category: 'cloud_devops',
    level: 'B1',
    definition_en: 'To make software available for use.',
    lexical_type: 'verb',
    tracks: ['technology'],
    lexical_register: 'neutral',
    editorial_priority: 'high',
    usefulness: 'Frequent in release and operations conversations.',
    context_tags: ['ci_cd', 'release'],
    usage_mode: 'technical',
    pronunciation_status: 'approved',
    context_sentences: [{
      id: 'sentence-deploy',
      english_text: 'We deploy the service after the tests pass.',
      spanish_translation: 'Desplegamos el servicio después de que pasan las pruebas.',
      spanish_phonetic: '...',
      spanish_phonetic_natural: '...',
      pronunciation_status: 'approved',
    }],
  })

  assert.equal(word.term, 'deploy')
  assert.equal(word.topic, 'cloud_devops')
  assert.equal(word.definitionEnglish, 'To make software available for use.')
  assert.equal(word.lexicalType, 'verb')
  assert.deepEqual(word.tracks, ['technology'])
  assert.equal(word.lexicalRegister, 'neutral')
  assert.equal(word.editorialPriority, 'high')
  assert.deepEqual(word.contextTags, ['ci_cd', 'release'])
  assert.equal(word.usageMode, 'technical')
  assert.equal(word.pronunciationStatus, 'approved')
  assert.equal(word.sentences[0].pronunciationStatus, 'approved')
})

test('reading resources map public questions and options without exposing answer keys', () => {
  const resource = toComprehensionResource({
    id: 'reading-a1-01',
    track: 'general',
    cefr_level: 'A1',
    skill: 'reading',
    title: 'A day at work',
    topic: 'Daily routines',
    content: 'Maria starts work at nine.',
    word_count: 6,
    sentence_count: 1,
    estimated_minutes: 3,
    comprehension_focus: 'Identify a stated time.',
    lexical_tags: ['work', 'time'],
    questions_json: JSON.stringify([{
      id: 'q1',
      prompt: 'When does Maria start work?',
      options: [{ id: 'a', text: 'At eight' }, { id: 'b', text: 'At nine' }],
      correct_option_id: 'b',
      rationale: 'The text states the time.',
    }]),
  })

  assert.equal(resource.skill, 'reading')
  assert.equal(resource.content, 'Maria starts work at nine.')
  assert.equal(resource.transcriptAvailable, false)
  assert.deepEqual(resource.questions, [{
    id: 'q1',
    prompt: 'When does Maria start work?',
    options: [{ id: 'a', text: 'At eight' }, { id: 'b', text: 'At nine' }],
  }])
  assert.equal('correct_option_id' in resource.questions[0], false)
})

test('listening resources never expose the transcript and text-only questions have empty options', () => {
  const resource = toComprehensionResource({
    id: 'listening-a1-01',
    track: 'technology',
    cefr_level: 'A1',
    skill: 'listening',
    title: 'Using a laptop',
    content: 'The hidden transcript must not reach the student.',
    audio_url: 'https://cdn.example.invalid/listening-a1-01.mp3',
    audio_status: 'approved',
    transcript_available: true,
    questions: ['Which device does the speaker use?'],
  })

  assert.equal(resource.skill, 'listening')
  assert.equal(resource.content, '')
  assert.equal(resource.transcriptAvailable, false)
  assert.equal(resource.audioUrl, 'https://cdn.example.invalid/listening-a1-01.mp3')
  assert.deepEqual(resource.questions, [{
    id: 'question-1',
    prompt: 'Which device does the speaker use?',
    options: [],
  }])
})
