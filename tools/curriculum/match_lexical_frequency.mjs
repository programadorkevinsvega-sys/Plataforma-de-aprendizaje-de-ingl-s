import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_CATALOG_PATH =
  'crates/content-vocabulary-service/data/lexical_catalog.v2.json';
export const DEFAULT_NGSL_SOURCE = {
  id: 'ngsl-1.2',
  name: 'New General Service List 1.2',
  authors: 'Browne, C., Culligan, B., and Phillips, J.',
  url: 'https://www.newgeneralservicelist.com/new-general-service-list',
  license: 'CC BY-SA 4.0',
  method: 'exact_modified_lemma',
};
export const DEFAULT_SPOKEN_SOURCE = {
  id: 'ngsl-spoken-1.2',
  name: 'New General Service List - Spoken 1.2',
  authors: 'Browne, C., and Culligan, B.',
  url: 'https://www.newgeneralservicelist.com/ngsl-spoken',
  license: 'CC BY-SA 4.0',
  method: 'exact_modified_lemma',
};

function normalizeHeader(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function parseCsvRows(csvText) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(csvText ?? '').replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const character = input[i];
    if (quoted) {
      if (character === '"' && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && cell.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }
  if (quoted) throw new Error('CSV inválido: comillas sin cerrar.');
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.replace(/\r$/, ''));
    if (row.some(value => value.trim() !== '')) rows.push(row);
  }
  if (rows.length < 2) throw new Error('CSV sin encabezado o sin filas de datos.');
  return rows;
}

function columnIndex(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index >= 0) return index;
  }
  return -1;
}

export function parseFrequencyCsv(csvText, { sourceName = 'frequency source' } = {}) {
  const rows = parseCsvRows(csvText);
  const headers = rows[0];
  const lemmaIndex = columnIndex(headers, [
    'lemma', 'headword', 'word', 'lexeme',
  ]);
  const rankIndex = columnIndex(headers, [
    'sfi rank', 'rank', 'frequency rank', 'frequency order', 'position',
  ]);
  if (lemmaIndex < 0 || rankIndex < 0) {
    throw new Error(
      `${sourceName}: se requieren columnas de lema (Lemma/Headword/Word) y rango (SFI Rank/Rank).`,
    );
  }

  const entries = new Map();
  const conflicts = [];
  let ignoredRows = 0;
  for (const [index, values] of rows.slice(1).entries()) {
    const originalLemma = String(values[lemmaIndex] ?? '').trim();
    const rawRank = String(values[rankIndex] ?? '').trim();
    const rank = Number(rawRank);
    if (!originalLemma || !Number.isInteger(rank) || rank < 1) {
      ignoredRows += 1;
      continue;
    }
    const lemma = originalLemma.normalize('NFKC').trim().toLocaleLowerCase('en-US');
    const existing = entries.get(lemma);
    if (existing && existing.rank !== rank) {
      conflicts.push({
        lemma,
        first_rank: existing.rank,
        conflicting_rank: rank,
        row: index + 2,
      });
      continue;
    }
    if (!existing) entries.set(lemma, { lemma: originalLemma, rank });
  }
  if (conflicts.length) {
    throw new Error(
      `${sourceName}: hay lemas con rangos contradictorios: ${JSON.stringify(conflicts.slice(0, 10))}`,
    );
  }
  if (entries.size === 0) throw new Error(`${sourceName}: no contiene lemas con rangos válidos.`);
  return { entries, ignoredRows, rowCount: rows.length - 1 };
}

function sourceEvidence(source, fileBytes, matchedLemma, rank) {
  return {
    source_id: source.id,
    source_name: source.name,
    attribution: source.authors,
    license: source.license,
    source_url: source.url,
    match_method: source.method,
    matched_lemma: matchedLemma,
    rank,
    source_sha256: createHash('sha256').update(fileBytes).digest('hex'),
  };
}

function lookupEligible(item) {
  if (!['word', 'technical_word', 'technical_term'].includes(item.lexical_type)) return false;
  const value = String(item.lexical_form ?? '').normalize('NFKC').trim();
  return /^[\p{L}][\p{L}'’\-]*$/u.test(value);
}

export function buildFrequencyMatchProposal(catalog, {
  ngslCsv,
  spokenCsv,
  ngslFileBytes = Buffer.from(ngslCsv),
  spokenFileBytes = Buffer.from(spokenCsv),
} = {}) {
  if (!catalog || catalog.format !== 'devfluency.lexical-catalog' || catalog.schema_version !== 2) {
    throw new Error('Se requiere un catálogo léxico v2.');
  }
  if (typeof ngslCsv !== 'string' || typeof spokenCsv !== 'string') {
    throw new Error('Se requieren los dos CSV oficiales: NGSL 1.2 y NGSL-Spoken 1.2.');
  }

  const general = parseFrequencyCsv(ngslCsv, { sourceName: DEFAULT_NGSL_SOURCE.name });
  const spoken = parseFrequencyCsv(spokenCsv, { sourceName: DEFAULT_SPOKEN_SOURCE.name });
  const matches = [];
  const notFound = [];
  const skipped = [];
  let exactGeneralMatches = 0;
  let exactSpokenMatches = 0;

  for (const item of catalog.lexical_items ?? []) {
    if (!lookupEligible(item)) {
      skipped.push({ id: item.id, lexical_form: item.lexical_form, reason: 'not_a_single_word_lemma_candidate' });
      continue;
    }
    const candidate = item.lexical_form.normalize('NFKC').trim();
    const key = candidate.toLocaleLowerCase('en-US');
    const generalMatch = general.entries.get(key) ?? null;
    const spokenMatch = spoken.entries.get(key) ?? null;
    if (!generalMatch && !spokenMatch) {
      notFound.push({ id: item.id, lexical_form: candidate });
      continue;
    }
    if (generalMatch) exactGeneralMatches += 1;
    if (spokenMatch) exactSpokenMatches += 1;
    matches.push({
      id: item.id,
      lexical_form: candidate,
      general: generalMatch
        ? sourceEvidence(DEFAULT_NGSL_SOURCE, ngslFileBytes, generalMatch.lemma, generalMatch.rank)
        : null,
      spoken: spokenMatch
        ? sourceEvidence(DEFAULT_SPOKEN_SOURCE, spokenFileBytes, spokenMatch.lemma, spokenMatch.rank)
        : null,
      interpretation: 'The source lists use modified lemmas; the rank applies to the source lemma entry, not to a separately disambiguated lexical sense.',
    });
  }

  return {
    format: 'devfluency.frequency-match-proposal',
    schema_version: 1,
    generated_at: new Date().toISOString(),
    source_policy: {
      exact_match_only: true,
      no_fuzzy_or_stem_matching: true,
      modified_lemma_semantics: true,
      sense_disambiguation: 'The NGSL rank is a lemma-level measure. It must not be represented as a sense-specific frequency.',
      attribution_and_license: 'Preserve the source attribution and CC BY-SA 4.0 notice when redistributing the matched rank data.',
    },
    source_files: {
      ngsl: {
        ...DEFAULT_NGSL_SOURCE,
        sha256: createHash('sha256').update(ngslFileBytes).digest('hex'),
        rows: general.rowCount,
        ignored_rows: general.ignoredRows,
      },
      spoken: {
        ...DEFAULT_SPOKEN_SOURCE,
        sha256: createHash('sha256').update(spokenFileBytes).digest('hex'),
        rows: spoken.rowCount,
        ignored_rows: spoken.ignoredRows,
      },
    },
    summary: {
      catalog_items: (catalog.lexical_items ?? []).length,
      exact_general_matches: exactGeneralMatches,
      exact_spoken_matches: exactSpokenMatches,
      items_with_any_match: matches.length,
      not_found_in_both_sources: notFound.length,
      skipped_multiword_or_non_word: skipped.length,
    },
    matches,
    not_found: notFound,
    skipped,
  };
}

export function applyFrequencyMatchProposal(catalog, proposal) {
  if (proposal?.format !== 'devfluency.frequency-match-proposal' || proposal?.schema_version !== 1) {
    throw new Error('La propuesta de frecuencia no tiene un formato reconocido.');
  }
  const byId = new Map((catalog.lexical_items ?? []).map(item => [item.id, item]));
  for (const match of proposal.matches ?? []) {
    const item = byId.get(match.id);
    if (!item) throw new Error(`La propuesta contiene un ID no encontrado: ${match.id}`);
    item.frequency ??= {};
    if (match.general) {
      item.frequency.general_rank = match.general.rank;
      item.frequency.general_evidence = match.general;
    } else {
      item.frequency.general_rank = null;
      delete item.frequency.general_evidence;
    }
    if (match.spoken) {
      item.frequency.spoken_rank = match.spoken.rank;
      item.frequency.spoken_evidence = match.spoken;
    } else {
      item.frequency.spoken_rank = null;
      delete item.frequency.spoken_evidence;
    }
    item.frequency.validation_status =
      match.general && match.spoken
        ? 'matched_both_modified_lemma_lists'
        : match.general
          ? 'matched_ngsl_modified_lemma_only'
          : 'matched_ngsl_spoken_modified_lemma_only';
  }
  return catalog;
}

function argumentValue(args, name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const catalogPath = path.resolve(argumentValue(args, '--catalog', DEFAULT_CATALOG_PATH));
  const ngslPath = argumentValue(args, '--ngsl');
  const spokenPath = argumentValue(args, '--ngsl-spoken');
  const reportPath = argumentValue(args, '--report', 'tools/curriculum/reports/frequency-match-proposal.v1.json');
  if (!ngslPath || !spokenPath) {
    throw new Error(
      'Uso: node tools/curriculum/match_lexical_frequency.mjs --ngsl <NGSL_12_stats.csv> --ngsl-spoken <NGSL-Spoken_12_stats.csv> [--report <archivo>] [--apply]',
    );
  }

  const catalogBytes = readFileSync(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString('utf8'));
  const ngslBytes = readFileSync(path.resolve(ngslPath));
  const spokenBytes = readFileSync(path.resolve(spokenPath));
  const proposal = buildFrequencyMatchProposal(catalog, {
    ngslCsv: ngslBytes.toString('utf8'),
    spokenCsv: spokenBytes.toString('utf8'),
    ngslFileBytes: ngslBytes,
    spokenFileBytes: spokenBytes,
  });

  writeFileSync(path.resolve(reportPath), JSON.stringify(proposal, null, 2) + '\n', 'utf8');
  if (args.includes('--apply')) {
    applyFrequencyMatchProposal(catalog, proposal);
    writeFileSync(catalogPath, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  }
  process.stdout.write(JSON.stringify({
    report: reportPath,
    applied_to_catalog: args.includes('--apply'),
    summary: proposal.summary,
    source_sha256: {
      ngsl: proposal.source_files.ngsl.sha256,
      spoken: proposal.source_files.spoken.sha256,
    },
  }, null, 2) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    process.stderr.write((error.stack ?? error.message) + '\n');
    process.exitCode = 1;
  });
}
