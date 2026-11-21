#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_PACKAGE =
  "tests/fixtures/curriculum/initial-release-english-general-pre-a1-v1.json";
const PRODUCTION_HOSTS = new Set(["app-ingles.jnmtortas.com"]);

function required(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value.trim();
}

function requiredSecret(value, name) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Falta configurar ${name}.`);
  }
  return value;
}

function assertStagingTarget(apiBaseUrl, environment) {
  const url = new URL(required(apiBaseUrl, "CURRICULUM_API_BASE_URL"));
  if (url.protocol !== "https:") {
    throw new Error("La validación editorial solo admite un endpoint HTTPS.");
  }
  if (environment !== "staging") {
    throw new Error(
      "La validación crea y publica contenido de prueba. Define CURRICULUM_ACCEPTANCE_ENV=staging; producción está bloqueada.",
    );
  }
  if (PRODUCTION_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error("El host de producción está bloqueado para esta validación.");
  }
  if (url.search || url.hash || url.pathname !== "/") {
    throw new Error("CURRICULUM_API_BASE_URL debe ser el origen HTTPS, sin ruta, query ni fragmento.");
  }
  return url;
}

async function requestJson(fetchImpl, baseUrl, token, method, route, body, expectedStatus = 200) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetchImpl(new URL(route, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
    redirect: "error",
  });
  const raw = await response.text();
  let payload = null;
  if (raw) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { message: "El BFF devolvió una respuesta que no es JSON." };
    }
  }

  if (response.status !== expectedStatus) {
    const detail =
      typeof payload?.message === "string" ? payload.message : "sin detalle";
    throw new Error(
      `${method} ${route}: HTTP ${response.status}; se esperaba ${expectedStatus} (${detail}).`,
    );
  }
  return payload;
}

async function login(fetchImpl, baseUrl, credentials, label) {
  const email = required(credentials?.email, `credenciales de ${label}: email`);
  const password = requiredSecret(credentials?.password, `credenciales de ${label}: password`);
  const response = await requestJson(
    fetchImpl,
    baseUrl,
    null,
    "POST",
    "/api/v1/auth/login",
    { email, password },
  );
  if (typeof response?.access_token !== "string" || response.access_token.length < 20) {
    throw new Error(`El login de ${label} no devolvió un access_token válido.`);
  }
  return response.access_token;
}

function findVersion(page, slug, status) {
  const item = page?.items?.find(
    (candidate) => candidate.slug === slug && candidate.status === status,
  );
  if (!item) {
    throw new Error(`La cola editorial no devolvió ${slug} en estado ${status}.`);
  }
  return item;
}

function toDraftDocument(detail, titleSuffix) {
  assert.ok(detail?.course, "El detalle curricular debe incluir course.");
  assert.ok(Array.isArray(detail.units) && detail.units.length > 0, "El curso debe tener unidades.");

  return {
    title: `${detail.course.title}${titleSuffix}`.slice(0, 200),
    description: `${detail.course.description} ${titleSuffix}`.trim(),
    units: detail.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      theme: unit.theme,
      description: unit.description,
      estimatedMinutes: unit.estimated_minutes > 0 ? unit.estimated_minutes : null,
      lessons: unit.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        estimatedMinutes: lesson.estimated_minutes > 0 ? lesson.estimated_minutes : null,
        objectives: lesson.objectives.map((objective) => ({
          id: objective.id,
          description: objective.description,
          successCriteria: objective.success_criteria,
        })),
      })),
    })),
  };
}

/**
 * Runs a live acceptance flow through the deployed Next.js/BFF origin.
 *
 * The test intentionally publishes a uniquely named course in staging so it
 * can verify the student catalog and the database's post-publication lock.
 * It never grants/revokes editor permissions and never writes to production.
 */
export async function runCurriculumAdminAcceptance({
  apiBaseUrl,
  environment,
  editorCredentials,
  nonEditorCredentials,
  packageText,
  fetchImpl = fetch,
  runId = randomUUID().replaceAll("-", "").slice(0, 12),
}) {
  const baseUrl = assertStagingTarget(apiBaseUrl, environment);
  assert.ok(typeof packageText === "string" && packageText.trim(), "packageText es obligatorio.");

  const packageDocument = JSON.parse(packageText);
  if (
    packageDocument?.format !== "devfluency.curriculum-content" ||
    packageDocument?.schema_version !== 1 ||
    !packageDocument?.course ||
    !packageDocument?.version
  ) {
    throw new Error("El archivo indicado no es un paquete curricular canónico v1.");
  }

  const editorToken = await login(fetchImpl, baseUrl, editorCredentials, "editor");
  const nonEditorToken = await login(fetchImpl, baseUrl, nonEditorCredentials, "no-editor");

  const denied = await requestJson(
    fetchImpl,
    baseUrl,
    nonEditorToken,
    "GET",
    "/api/v1/curriculum/editor/versions?page=1&page_size=10",
    undefined,
    403,
  );
  assert.equal(typeof denied?.code, "string", "El 403 debe incluir un código de error.");

  const courseSlug = `staging-acceptance-${runId.toLowerCase()}`;
  packageDocument.course.slug = courseSlug;
  packageDocument.version.title =
    `${String(packageDocument.version.title).slice(0, 160)} [STAGING ACCEPTANCE]`;
  const serializedPackage = JSON.stringify(packageDocument);

  const preview = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "POST",
    "/api/v1/curriculum/editor/import",
    { package_json: serializedPackage, apply: false },
  );
  assert.equal(preview.dry_run, true, "La previsualización debe revertir la transacción.");
  assert.equal(preview.applied, false, "La previsualización no debe persistir el paquete.");
  assert.equal(preview.state, "imported", "El paquete nuevo debe poder importarse.");

  const imported = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "POST",
    "/api/v1/curriculum/editor/import",
    { package_json: serializedPackage, apply: true },
  );
  assert.equal(imported.applied, true, "La confirmación debe crear el borrador.");
  assert.equal(imported.dry_run, false);
  assert.ok(imported.course_version_id, "La importación debe devolver course_version_id.");
  const courseVersionId = imported.course_version_id;

  const detailRoute = `/api/v1/curriculum/courses/${encodeURIComponent(courseVersionId)}`;
  const actionsRoute =
    `/api/v1/curriculum/editor/versions/${encodeURIComponent(courseVersionId)}/actions`;
  const draftRoute =
    `/api/v1/curriculum/editor/versions/${encodeURIComponent(courseVersionId)}/draft`;
  const queueRoute = (status) => {
    const query = new URLSearchParams({
      page: "1",
      page_size: "10",
      status,
      search: courseSlug,
    });
    return `/api/v1/curriculum/editor/versions?${query}`;
  };

  let queue = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "GET",
    queueRoute("draft"),
  );
  let version = findVersion(queue, courseSlug, "draft");
  let detail = await requestJson(fetchImpl, baseUrl, editorToken, "GET", detailRoute);
  let draft = toDraftDocument(detail, " [acceptance edit 1]");

  const saved = await requestJson(fetchImpl, baseUrl, editorToken, "PUT", draftRoute, {
    expected_updated_at: version.updated_at,
    draft_json: JSON.stringify(draft),
  });
  assert.ok(saved.revision_number >= 1, "El guardado debe registrar una revisión.");
  assert.match(saved.content_sha256, /^[a-f0-9]{64}$/);

  // The timestamp fetched before the successful save must now be rejected.
  await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "PUT",
    draftRoute,
    {
      expected_updated_at: version.updated_at,
      draft_json: JSON.stringify(draft),
    },
    409,
  );

  const submittedForChanges = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "POST",
    actionsRoute,
    { action: "submit" },
  );
  assert.equal(submittedForChanges.next_status, "review");

  const changesRequested = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "POST",
    actionsRoute,
    {
      action: "review",
      decision: "changes_requested",
      comments: "Staging acceptance: verify the correction-and-resubmission path.",
    },
  );
  assert.equal(changesRequested.next_status, "draft");

  queue = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "GET",
    queueRoute("draft"),
  );
  version = findVersion(queue, courseSlug, "draft");
  detail = await requestJson(fetchImpl, baseUrl, editorToken, "GET", detailRoute);
  draft = toDraftDocument(detail, " [acceptance edit 2 — approved]");
  const secondSave = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "PUT",
    draftRoute,
    {
      expected_updated_at: version.updated_at,
      draft_json: JSON.stringify(draft),
    },
  );
  assert.ok(secondSave.revision_number > saved.revision_number);

  const submittedForApproval = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "POST",
    actionsRoute,
    { action: "submit" },
  );
  assert.equal(submittedForApproval.next_status, "review");

  const approved = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "POST",
    actionsRoute,
    {
      action: "review",
      decision: "approved",
      comments: "Staging acceptance: approval recorded by the same editor.",
    },
  );
  assert.equal(approved.next_status, "review");

  const published = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "POST",
    actionsRoute,
    { action: "publish" },
  );
  assert.equal(published.next_status, "published");

  const publishedQueue = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "GET",
    queueRoute("published"),
  );
  const publishedVersion = findVersion(publishedQueue, courseSlug, "published");
  const studentCatalogQuery = new URLSearchParams({
    page: "1",
    page_size: "50",
    search: courseSlug,
  });
  const studentCatalog = await requestJson(
    fetchImpl,
    baseUrl,
    nonEditorToken,
    "GET",
    `/api/v1/curriculum/courses?${studentCatalogQuery}`,
  );
  assert.ok(
    studentCatalog.items?.some(
      (item) => item.course_version_id === courseVersionId && item.status === "published",
    ),
    "La versión publicada debe aparecer en el catálogo del estudiante.",
  );

  const publishedDetail = await requestJson(
    fetchImpl,
    baseUrl,
    nonEditorToken,
    "GET",
    detailRoute,
  );
  assert.equal(publishedDetail.course?.status, "published");

  await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "PUT",
    draftRoute,
    {
      expected_updated_at: publishedVersion.updated_at,
      draft_json: JSON.stringify(draft),
    },
    409,
  );

  return {
    courseSlug,
    courseVersionId,
    previewWasDryRun: preview.dry_run,
    draftRevision: secondSave.revision_number,
    published: true,
    postPublicationEditRejected: true,
    nonEditorDenied: true,
  };
}

async function main() {
  const apiBaseUrl = required(process.env.CURRICULUM_API_BASE_URL, "CURRICULUM_API_BASE_URL");
  const environment = required(process.env.CURRICULUM_ACCEPTANCE_ENV, "CURRICULUM_ACCEPTANCE_ENV");
  const editorCredentials = {
    email: required(process.env.CURRICULUM_EDITOR_EMAIL, "CURRICULUM_EDITOR_EMAIL"),
    password: requiredSecret(process.env.CURRICULUM_EDITOR_PASSWORD, "CURRICULUM_EDITOR_PASSWORD"),
  };
  const nonEditorCredentials = {
    email: required(process.env.CURRICULUM_NON_EDITOR_EMAIL, "CURRICULUM_NON_EDITOR_EMAIL"),
    password: requiredSecret(process.env.CURRICULUM_NON_EDITOR_PASSWORD, "CURRICULUM_NON_EDITOR_PASSWORD"),
  };
  const packagePath = path.resolve(
    process.env.CURRICULUM_ACCEPTANCE_PACKAGE || DEFAULT_PACKAGE,
  );
  const packageText = await readFile(packagePath, "utf8");

  const result = await runCurriculumAdminAcceptance({
    apiBaseUrl,
    environment,
    editorCredentials,
    nonEditorCredentials,
    packageText,
  });
  console.log("Curriculum administration acceptance passed:");
  console.log(JSON.stringify(result, null, 2));
  console.log("The uniquely named acceptance course remains published in the staging catalog.");
}

const invokedDirectly =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().catch((error) => {
    console.error(`Curriculum administration acceptance failed: ${error.message}`);
    process.exitCode = 1;
  });
}
