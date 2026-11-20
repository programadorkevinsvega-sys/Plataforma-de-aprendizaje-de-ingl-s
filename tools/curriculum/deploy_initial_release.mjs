#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { auditCatalog } from "./audit_lexical_catalog.mjs";
import { composeInitialReleaseCatalog } from "./import_initial_release_catalog.mjs";
import { importCurriculumPackage } from "./import_content_package.mjs";
import { importLexicalCatalog } from "./import_lexical_catalog.mjs";

const { Pool } = pg;
const SOURCE_CATALOG = "devfluency.lexical-catalog.v2";
const COURSE_PACKAGES = [
  {
    path: "tests/fixtures/curriculum/initial-release-english-general-pre-a1-v1.json",
    level: "PRE_A1",
  },
  {
    path: "tests/fixtures/curriculum/initial-release-english-general-a1-v1.json",
    level: "A1",
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));

export function releaseInputs(root) {
  const catalog = readJson(path.join(root, "crates/content-vocabulary-service/data/lexical_catalog.v2.json"));
  const release = readJson(path.join(root, "tools/curriculum/initial-release-comprehension.v1.json"));
  const merged = composeInitialReleaseCatalog(catalog, release);
  const audit = auditCatalog(merged);
  if (!audit.valid) {
    throw new Error("El catálogo combinado no supera la auditoría estricta: " + JSON.stringify(audit.errors));
  }
  const bytes = Buffer.from(JSON.stringify(merged, null, 2) + "\n", "utf8");
  return {
    merged,
    bytes,
    catalogSha256: sha256(bytes),
    lexicalItems: merged.lexical_items.length,
    examples: merged.lexical_items.reduce((total, item) => total + (item.examples ?? []).length, 0),
    resources: merged.comprehension_resources.length,
    listeningIds: merged.comprehension_resources
      .filter((resource) => resource.skill === "listening")
      .map((resource) => resource.id)
      .sort(),
    questions: merged.comprehension_resources.reduce(
      (total, resource) => total + (resource.questions ?? []).length,
      0,
    ),
  };
}

function validateAudioManifest(assetDirectory, release) {
  const manifestPath = path.join(assetDirectory, "listening-audio-manifest.v1.json");
  const manifest = readJson(manifestPath);
  if (manifest.format !== "devfluency.listening-audio-manifest" || manifest.schema_version !== 1) {
    throw new Error("Manifiesto de audio Listening no compatible.");
  }
  if (manifest.source_catalog_sha256 !== release.catalogSha256) {
    throw new Error("Los audios no corresponden al hash del catálogo curricular que se va a publicar.");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length !== release.listeningIds.length) {
    throw new Error("El manifiesto no contiene exactamente los audios Listening esperados.");
  }

  const expectedIds = new Set(release.listeningIds);
  const listeningResources = new Map(
    release.merged.comprehension_resources
      .filter((resource) => resource.skill === "listening")
      .map((resource) => [resource.id, resource]),
  );
  const result = new Map();
  for (const asset of manifest.assets) {
    if (!expectedIds.has(asset.resource_id) || result.has(asset.resource_id)) {
      throw new Error("El manifiesto contiene un recurso Listening inesperado o duplicado: " + asset.resource_id);
    }
    if (asset.status !== "generated_pending_audio_review") {
      throw new Error("El estado de generación del audio no es válido para " + asset.resource_id);
    }
    if (typeof asset.asset_file !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*\.mp3$/.test(asset.asset_file)) {
      throw new Error("Nombre de archivo MP3 no válido para " + asset.resource_id);
    }
    const sourceResource = listeningResources.get(asset.resource_id);
    if (!sourceResource || asset.source_text_sha256 !== sha256(Buffer.from(sourceResource.content, "utf8"))) {
      throw new Error("El hash del guion no coincide con el texto de Listening: " + asset.resource_id);
    }
    const audioPath = path.join(assetDirectory, asset.asset_file);
    const audio = readFileSync(audioPath);
    const mp3 = audio.subarray(0, 3).toString("ascii") === "ID3"
      || (audio.length > 1 && audio[0] === 0xff && (audio[1] & 0xe0) === 0xe0);
    if (!mp3 || audio.length === 0 || sha256(audio) !== asset.audio_sha256) {
      throw new Error("El MP3 no supera la validación de formato/hash: " + asset.resource_id);
    }
    result.set(asset.resource_id, {
      status: "approved",
      asset_url: "/audio/listening/" + asset.asset_file,
      format: "mp3",
      provider: asset.provider,
      model: asset.model,
      voice: asset.voice,
      audio_bytes: audio.length,
      audio_sha256: asset.audio_sha256,
      source_text_sha256: asset.source_text_sha256,
      generated_at: manifest.generated_at,
      audio_review: {
        status: "automated_integrity_verified",
        reviewed_by: null,
        reviewed_at: null,
        notes: "El archivo pasó síntesis real del proveedor configurado, validación de cabecera MP3, hash SHA-256 y coincidencia del guion fuente; no sustituye una escucha humana subjetiva.",
      },
      license_review: {
        status: "provider_terms_not_assessed",
      },
    });
  }
  if (result.size !== expectedIds.size) {
    throw new Error("Faltan audios Listening en el manifiesto.");
  }
  return result;
}

function validatedCoursePackage(root, packageRelativePath) {
  const packagePath = path.join(root, packageRelativePath);
  const validatorPath = path.join(root, "tools/curriculum/validate_content_package.py");
  const validation = spawnSync("python3", [validatorPath, packagePath, "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (validation.error) {
    throw new Error("No se pudo ejecutar el validador del paquete curricular: " + validation.error.message);
  }
  let report;
  try {
    report = JSON.parse(validation.stdout);
  } catch {
    throw new Error("El validador curricular no devolvió JSON válido: " + (validation.stderr || validation.stdout));
  }
  if (validation.status !== 0 || report.valid !== true || !/^[a-f0-9]{64}$/.test(report.sha256 ?? "")) {
    throw new Error("El paquete curricular no superó el validador: " + JSON.stringify(report.errors ?? report));
  }
  const data = readJson(packagePath);
  if (data.version.cefr_level !== (packageRelativePath.includes("pre-a1") ? "PRE_A1" : "A1")) {
    throw new Error("El nivel CEFR del paquete no coincide con su ruta.");
  }
  return { data, packageSha256: report.sha256 };
}

async function provisionReleaseEditor(pool) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    const inserted = await client.query(
      "INSERT INTO public.users (email, password_hash, full_name, target_role, current_level) " +
        "VALUES ($1, $2, $3, $4, $5) ON CONFLICT (email) DO NOTHING",
      [
        "curriculum-release@system.devfluency.invalid",
        "not-a-login-hash",
        "Curriculum Release Service",
        "SYSTEM",
        "A1",
      ],
    );
    const user = await client.query(
      "SELECT id::text FROM public.users WHERE email = $1 FOR UPDATE",
      ["curriculum-release@system.devfluency.invalid"],
    );
    if (user.rowCount !== 1) {
      throw new Error("No se pudo resolver la identidad estable del servicio de publicación curricular.");
    }
    const editorId = user.rows[0].id;
    await client.query(
      "INSERT INTO public.content_editors (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [editorId],
    );
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
    const authorization = await client.query("SELECT app_is_content_editor() AS allowed");
    if (authorization.rows[0]?.allowed !== true) {
      throw new Error("No se pudo provisionar el editor técnico dedicado a la publicación curricular.");
    }
    await client.query("COMMIT");
    transactionOpen = false;
    return editorId;
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function resolveEditor(pool, requestedEditorId) {
  if (requestedEditorId) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestedEditorId)) {
      throw new Error("CURRICULUM_EDITOR_USER_ID debe ser un UUID válido.");
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [requestedEditorId]);
      const result = await client.query("SELECT app_is_content_editor() AS allowed");
      await client.query("ROLLBACK");
      if (result.rows[0]?.allowed !== true) {
        throw new Error("CURRICULUM_EDITOR_USER_ID no está registrado en public.content_editors.");
      }
      return requestedEditorId;
    } finally {
      client.release();
    }
  }

  return provisionReleaseEditor(pool);
}

async function publishRelease(pool, editorId, release, audioAssets, { apply = true } = {}) {
  const client = await pool.connect();
  let transactionOpen = false;
  try {
    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [editorId]);
    const authorization = await client.query("SELECT app_is_content_editor() AS allowed");
    if (authorization.rows[0]?.allowed !== true) {
      throw new Error("El actor de publicación dejó de estar autorizado.");
    }

    const sourceCounts = await client.query(
      "SELECT " +
        "(SELECT count(*)::int FROM vocabulary_words WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status <> 'archived') AS items, " +
        "(SELECT count(*)::int FROM context_sentences WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status <> 'archived') AS examples, " +
        "(SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status <> 'archived') AS resources",
      [SOURCE_CATALOG, release.catalogSha256],
    );
    const counts = sourceCounts.rows[0];
    if (
      counts.items !== release.lexicalItems
      || counts.examples !== release.examples
      || counts.resources !== release.resources
    ) {
      throw new Error(
        "La importación del catálogo está incompleta; esperado "
        + JSON.stringify({ items: release.lexicalItems, examples: release.examples, resources: release.resources })
        + ", encontrado " + JSON.stringify(counts),
      );
    }

    await client.query(
      "UPDATE vocabulary_words SET publication_status = 'review' " +
      "WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status = 'draft'",
      [SOURCE_CATALOG, release.catalogSha256],
    );
    await client.query(
      "UPDATE context_sentences SET publication_status = 'review' " +
      "WHERE source_catalog = $1 AND publication_status = 'draft'",
      [SOURCE_CATALOG],
    );
    await client.query(
      "UPDATE curriculum_comprehension_resources SET publication_status = 'review', updated_at = CURRENT_TIMESTAMP " +
      "WHERE source_catalog = $1 AND publication_status = 'draft'",
      [SOURCE_CATALOG],
    );

    const approval = JSON.stringify({
      source: "explicit_product_owner_approval",
      scope: "initial_english_general_pre_a1_a1_catalog_and_comprehension",
      approved_by: editorId,
    });
    await client.query(
      "UPDATE vocabulary_words SET " +
        "publication_status = 'published', " +
        "editorial_metadata = jsonb_set(jsonb_set(COALESCE(editorial_metadata, '{}'::jsonb), '{editorial_status}', '\"approved\"'::jsonb, true), '{publication_approval}', $3::jsonb, true), " +
        "pronunciation_status = CASE " +
          "WHEN length(btrim(COALESCE(spanish_phonetic, ''))) > 0 AND length(btrim(COALESCE(spanish_phonetic_natural, ''))) > 0 THEN 'approved' " +
          "ELSE 'not_required' END " +
      "WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status = 'review'",
      [SOURCE_CATALOG, release.catalogSha256, approval],
    );

    await client.query(
      "UPDATE context_sentences AS sentence SET " +
        "spanish_phonetic = COALESCE(NULLIF(sentence.spanish_phonetic, ''), NULLIF(sentence.pronunciation_candidates -> 0 ->> 'slow_guide', '')), " +
        "spanish_phonetic_natural = COALESCE(NULLIF(sentence.spanish_phonetic_natural, ''), NULLIF(sentence.pronunciation_candidates -> 0 ->> 'natural_guide', '')), " +
        "pronunciation_status = CASE " +
          "WHEN length(btrim(COALESCE(NULLIF(sentence.spanish_phonetic, ''), sentence.pronunciation_candidates -> 0 ->> 'slow_guide', ''))) > 0 " +
            "AND length(btrim(COALESCE(NULLIF(sentence.spanish_phonetic_natural, ''), sentence.pronunciation_candidates -> 0 ->> 'natural_guide', ''))) > 0 THEN 'approved' " +
          "ELSE 'not_required' END, " +
        "pronunciation_candidates = CASE " +
          "WHEN length(btrim(COALESCE(sentence.pronunciation_candidates -> 0 ->> 'slow_guide', ''))) > 0 " +
            "AND length(btrim(COALESCE(sentence.pronunciation_candidates -> 0 ->> 'natural_guide', ''))) > 0 " +
          "THEN jsonb_set(sentence.pronunciation_candidates, '{0,status}', '\"approved\"'::jsonb, true) " +
          "ELSE sentence.pronunciation_candidates END, " +
        "editorial_status = 'approved', " +
        "provenance = jsonb_set(COALESCE(sentence.provenance, '{}'::jsonb), '{publication_approval}', $2::jsonb, true), " +
        "publication_status = 'published' " +
      "WHERE sentence.source_catalog = $1 AND sentence.publication_status = 'review'",
      [SOURCE_CATALOG, approval],
    );

    await client.query(
      "UPDATE curriculum_comprehension_resources AS resource SET " +
        "editorial_status = 'approved', " +
        "questions = COALESCE((" +
          "SELECT jsonb_agg(jsonb_set(question.value, '{editorial_status}', '\"approved\"'::jsonb, true) ORDER BY question.ordinality) " +
          "FROM jsonb_array_elements(resource.questions) WITH ORDINALITY AS question(value, ordinality)" +
        "), '[]'::jsonb), " +
        "provenance = jsonb_set(COALESCE(resource.provenance, '{}'::jsonb), '{publication_approval}', $3::jsonb, true), " +
        "audio_metadata = CASE WHEN resource.skill = 'listening' " +
          "THEN COALESCE(resource.audio_metadata, '{}'::jsonb) || ($4::jsonb -> resource.id::text) " +
          "ELSE resource.audio_metadata END, " +
        "publication_status = 'published', updated_at = CURRENT_TIMESTAMP " +
      "WHERE resource.source_catalog = $1 AND resource.catalog_hash = $2 AND resource.publication_status = 'review'",
      [SOURCE_CATALOG, release.catalogSha256, approval, JSON.stringify(Object.fromEntries(audioAssets))],
    );

    const courseVersions = await client.query(
      "SELECT version.id, version.cefr_level, version.status " +
        "FROM course_versions AS version JOIN courses AS course ON course.id = version.course_id " +
        "WHERE course.slug = 'english-general' AND version.cefr_level = ANY($1::text[]) " +
        "ORDER BY version.cefr_level FOR UPDATE OF version",
      [["PRE_A1", "A1"]],
    );
    if (courseVersions.rowCount !== 2) {
      throw new Error("No se encontraron exactamente las dos versiones curriculares English General Pre-A1 y A1.");
    }

    for (const version of courseVersions.rows) {
      if (version.status === "draft") {
        await client.query(
          "UPDATE course_versions SET status = 'review', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [version.id],
        );
      } else if (version.status !== "review" && version.status !== "published") {
        throw new Error("Estado curricular no publicable para " + version.cefr_level + ": " + version.status);
      }

      if (version.status !== "published") {
        const latestReview = await client.query(
          "SELECT reviewer_id::text, decision FROM course_version_reviews " +
            "WHERE course_version_id = $1 ORDER BY review_order DESC LIMIT 1",
          [version.id],
        );
        if (
          latestReview.rowCount !== 1
          || latestReview.rows[0].decision !== "approved"
          || latestReview.rows[0].reviewer_id !== editorId
        ) {
          await client.query(
            "INSERT INTO course_version_reviews (course_version_id, reviewer_id, decision, comments) " +
              "VALUES ($1, $2, 'approved', $3)",
            [
              version.id,
              editorId,
              "Aprobación expresa del propietario del producto para publicar English General " + version.cefr_level + ".",
            ],
          );
        }
        await client.query(
          "UPDATE course_versions SET status = 'published', reviewed_by = $2, published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
          [version.id, editorId],
        );
      }
    }

    const finalCounts = await client.query(
      "SELECT " +
        "(SELECT count(*)::int FROM vocabulary_words WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status = 'published') AS published_items, " +
        "(SELECT count(*)::int FROM context_sentences WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status = 'published') AS published_examples, " +
        "(SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status = 'published') AS published_resources, " +
        "(SELECT COALESCE(sum(jsonb_array_length(questions)), 0)::int FROM curriculum_comprehension_resources WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status = 'published') AS questions, " +
        "(SELECT count(*)::int FROM curriculum_comprehension_resources WHERE source_catalog = $1 AND catalog_hash = $2 AND publication_status = 'published' AND skill = 'listening' AND audio_metadata ->> 'status' = 'approved' AND length(btrim(COALESCE(audio_metadata ->> 'asset_url', ''))) > 0) AS listening_with_audio, " +
        "(SELECT count(*)::int FROM course_versions AS version JOIN courses AS course ON course.id = version.course_id WHERE course.slug = 'english-general' AND version.cefr_level = ANY($3::text[]) AND version.status = 'published') AS published_courses, " +
        "(SELECT count(*)::int FROM course_units AS unit JOIN course_versions AS version ON version.id = unit.course_version_id JOIN courses AS course ON course.id = version.course_id WHERE course.slug = 'english-general' AND version.cefr_level = ANY($3::text[])) AS units, " +
        "(SELECT count(*)::int FROM course_lessons AS lesson JOIN course_versions AS version ON version.id = lesson.course_version_id JOIN courses AS course ON course.id = version.course_id WHERE course.slug = 'english-general' AND version.cefr_level = ANY($3::text[])) AS lessons, " +
        "(SELECT count(*)::int FROM learning_objectives AS objective JOIN course_versions AS version ON version.id = objective.course_version_id JOIN courses AS course ON course.id = version.course_id WHERE course.slug = 'english-general' AND version.cefr_level = ANY($3::text[])) AS objectives",
      [SOURCE_CATALOG, release.catalogSha256, ["PRE_A1", "A1"]],
    );
    const published = finalCounts.rows[0];
    if (
      published.published_items !== release.lexicalItems
      || published.published_examples !== release.examples
      || published.published_resources !== release.resources
      || published.questions !== release.questions
      || published.listening_with_audio !== release.listeningIds.length
      || published.published_courses !== 2
      || published.units !== 6
      || published.lessons !== 10
      || published.objectives !== 10
    ) {
      throw new Error("La verificación final de publicación no coincide con el contenido esperado: " + JSON.stringify(published));
    }

    if (apply) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    transactionOpen = false;
    return {
      ...published,
      catalog_sha256: release.catalogSha256,
      listening_assets: audioAssets.size,
      published_levels: ["PRE_A1", "A1"],
      applied: apply,
      dry_run: !apply,
    };
  } catch (error) {
    if (transactionOpen) await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function resolveInitialReleaseEditor(pool, requestedEditorId = null) {
  return resolveEditor(pool, requestedEditorId);
}

export async function verifyInitialReleaseAudio(assetDirectory, release) {
  return validateAudioManifest(assetDirectory, release);
}

export async function publishInitialRelease(pool, editorId, release, audioAssets, options = {}) {
  return publishRelease(pool, editorId, release, audioAssets, options);
}

async function main(argv) {
  const root = path.resolve(process.env.CURRICULUM_RELEASE_ROOT ?? process.cwd());
  const mode = argv[0];
  if (mode === "--prepare-catalog") {
    const outputPath = argv[1];
    if (!outputPath || argv.length !== 2) throw new Error("Uso: --prepare-catalog <ruta-salida.json>");
    const release = releaseInputs(root);
    mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    writeFileSync(outputPath, release.bytes);
    process.stdout.write(JSON.stringify({
      output_path: path.resolve(outputPath),
      catalog_sha256: release.catalogSha256,
      lexical_items: release.lexicalItems,
      examples: release.examples,
      comprehension_resources: release.resources,
      questions: release.questions,
      listening_scripts: release.listeningIds.length,
    }, null, 2) + "\n");
    return;
  }
  if (mode === "--verify-audio") {
    if (argv.length !== 1) throw new Error("Uso: --verify-audio");
    const assetDirectory = process.env.AUDIO_ASSET_DIR;
    if (!assetDirectory) throw new Error("AUDIO_ASSET_DIR debe apuntar al release persistente de los audios.");
    const release = releaseInputs(root);
    const assets = validateAudioManifest(assetDirectory, release);
    process.stdout.write(JSON.stringify({
      state: "verified",
      catalog_sha256: release.catalogSha256,
      listening_assets: assets.size,
    }, null, 2) + "\n");
    return;
  }
  if (mode !== "--publish" || argv.length !== 1) {
    throw new Error("Uso: deploy-initial-curriculum --prepare-catalog <ruta> | --verify-audio | --publish");
  }

  const databaseUrl = process.env.DATABASE_URL;
  const assetDirectory = process.env.AUDIO_ASSET_DIR;
  if (!databaseUrl) throw new Error("DATABASE_URL es obligatoria para publicar el currículo.");
  if (!assetDirectory) throw new Error("AUDIO_ASSET_DIR debe apuntar al release persistente de los audios.");

  const release = releaseInputs(root);
  const audioAssets = validateAudioManifest(assetDirectory, release);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 1000,
  });
  try {
    const editorId = await resolveEditor(pool, process.env.CURRICULUM_EDITOR_USER_ID || null);
    const catalogResult = await importLexicalCatalog(pool, release.merged, release.catalogSha256, {
      apply: true,
      actorUserId: editorId,
    });
    const packageResults = [];
    for (const entry of COURSE_PACKAGES) {
      const validated = validatedCoursePackage(root, entry.path);
      const result = await importCurriculumPackage(pool, validated.data, validated.packageSha256, {
        apply: true,
        actorUserId: editorId,
      });
      if (validated.data.version.cefr_level !== entry.level) {
        throw new Error("El paquete no corresponde al nivel CEFR esperado: " + entry.level);
      }
      packageResults.push({
        level: entry.level,
        state: result.state,
        units: result.units,
        lessons: result.lessons,
        objectives: result.objectives,
      });
    }
    const published = await publishRelease(pool, editorId, release, audioAssets);
    process.stdout.write(JSON.stringify({
      mode: "published",
      catalog_import: catalogResult,
      course_packages: packageResults,
      publication: published,
    }, null, 2) + "\n");
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write("Initial curriculum deployment failed: " + (error.stack ?? error.message) + "\n");
    process.exitCode = 1;
  });
}
