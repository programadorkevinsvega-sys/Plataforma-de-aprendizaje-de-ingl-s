import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyFrequencyMatchProposal,
  buildFrequencyMatchProposal,
  parseFrequencyCsv,
} from '../match_lexical_frequency.mjs';

const catalog = () => ({
  format: 'devfluency.lexical-catalog',
  schema_version: 2,
  lexical_items: [
    {
      id: 'hello-word',
      lexical_form: 'hello',
      lexical_type: 'word',
      frequency: { general_rank: null, spoken_rank: null, validation_status: 'pending_corpus_match' },
    },
    {
      id: 'clean-word',
      lexical_form: 'clean',
      lexical_type: 'word',
      frequency: { general_rank: null, spoken_rank: null, validation_status: 'pending_corpus_match' },
    },
    {
      id: 'clean-phrase',
      lexical_form: 'clean up',
      lexical_type: 'phrasal_verb',
      frequency: { general_rank: null, spoken_rank: null, validation_status: 'pending_corpus_match' },
    },
    {
      id: 'unlisted-word',
      lexical_form: 'unlistedword',
      lexical_type: 'word',
      frequency: { general_rank: null, spoken_rank: null, validation_status: 'pending_corpus_match' },
    },
  ],
});

const generalCsv = 'Lemma,SFI Rank,Definition\nHello,42,"a greeting, informal"\nclean,250,"free from dirt"\n';
const spokenCsv = 'Headword,Rank,Notes\nhello,9,"common in speech"\n';
const bytes = Buffer.from('fixture source bytes');

test('parses quoted CSV cells, case-insensitive headers and ranks', () => {
  const parsed = parseFrequencyCsv(generalCsv);
  assert.equal(parsed.entries.get('hello').rank, 42);
  assert.equal(parsed.entries.get('clean').rank, 250);
  assert.equal(parsed.entries.size, 2);
});

test('rejects conflicting ranks for the same lemma instead of selecting one', () => {
  assert.throws(
    () => parseFrequencyCsv('Lemma,SFI Rank\nclean,250\nclean,251\n'),
    /rangos contradictorios/,
  );
});

test('creates exact single-word lemma matches and skips phrases without fuzzy matching', () => {
  const proposal = buildFrequencyMatchProposal(catalog(), {
    ngslCsv: generalCsv,
    spokenCsv,
    ngslFileBytes: bytes,
    spokenFileBytes: Buffer.from('spoken fixture'),
  });
  assert.equal(proposal.summary.exact_general_matches, 2);
  assert.equal(proposal.summary.exact_spoken_matches, 1);
  assert.equal(proposal.summary.items_with_any_match, 2);
  assert.equal(proposal.summary.skipped_multiword_or_non_word, 1);
  assert.equal(proposal.summary.not_found_in_both_sources, 1);

  const hello = proposal.matches.find(match => match.id === 'hello-word');
  assert.equal(hello.general.rank, 42);
  assert.equal(hello.spoken.rank, 9);
  assert.equal(hello.general.source_sha256, 'c6d0c3944dcf75fdae82b0bf055bf02c90e6a35bf7df439bacf671a119c7f828');
  assert.equal(hello.general.match_method, 'exact_modified_lemma');
  assert.match(proposal.summary.items_with_any_match.toString(), /^2$/);
});

test('applies evidence with attribution, methodology and both source hashes to matched items', () => {
  const data = catalog();
  const proposal = buildFrequencyMatchProposal(data, {
    ngslCsv: generalCsv,
    spokenCsv,
    ngslFileBytes: bytes,
    spokenFileBytes: Buffer.from('spoken fixture'),
  });
  applyFrequencyMatchProposal(data, proposal);

  const hello = data.lexical_items.find(item => item.id === 'hello-word');
  assert.equal(hello.frequency.general_rank, 42);
  assert.equal(hello.frequency.spoken_rank, 9);
  assert.equal(hello.frequency.validation_status, 'verified_against_both_modified_lemma_lists');
  assert.equal(hello.frequency.general_match_status, 'matched_exact_modified_lemma');
  assert.equal(hello.frequency.spoken_match_status, 'matched_exact_modified_lemma');
  assert.equal(hello.frequency.general_evidence.attribution, 'Browne, C., Culligan, B., and Phillips, J.');
  assert.equal(hello.frequency.spoken_evidence.license, 'CC BY-SA 4.0');

  const clean = data.lexical_items.find(item => item.id === 'clean-word');
  assert.equal(clean.frequency.general_rank, 250);
  assert.equal(clean.frequency.spoken_rank, null);
  assert.equal(clean.frequency.validation_status, 'verified_against_both_modified_lemma_lists');
  assert.equal(clean.frequency.general_match_status, 'matched_exact_modified_lemma');
  assert.equal(clean.frequency.spoken_match_status, 'not_in_source');

  const unlisted = data.lexical_items.find(item => item.id === 'unlisted-word');
  assert.equal(unlisted.frequency.validation_status, 'verified_against_both_modified_lemma_lists');
  assert.equal(unlisted.frequency.general_match_status, 'not_in_source');
  assert.equal(unlisted.frequency.spoken_match_status, 'not_in_source');
});
