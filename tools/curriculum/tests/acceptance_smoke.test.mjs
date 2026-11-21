import assert from "node:assert/strict";
import test from "node:test";
import { runCurriculumAdminAcceptance } from "../acceptance-smoke.mjs";

const editorToken = "editor-access-token-with-sufficient-length";
const nonEditorToken = "non-editor-access-token-with-sufficient-length";
const slug = "staging-acceptance-deadbeef0011";
const courseVersionId = "00000000-0000-4000-8000-000000000105";

const samplePackage = JSON.stringify({
  format: "devfluency.curriculum-content",
  schema_version: 1,
  metadata: {
    author: "Test author",
    authored_at: "2026-11-20",
    source: { name: "Test content", url: null, license: "original" },
  },
  course: { slug: "english-general", track_code: "general" },
  version: {
    version_number: 1,
    cefr_level: "PRE_A1",
    title: "English General Pre-A1",
    description: "A short staging acceptance course.",
    locale: "en",
  },
});

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createAcceptanceFetch() {
  const calls = [];
  let draftSaves = 0;
  let editorialActions = 0;
  let draftQueueReads = 0;

  const detail = {
    course: {
      course_version_id: courseVersionId,
      title: "English General Pre-A1 [STAGING ACCEPTANCE]",
      description: "A staging course.",
      status: "draft",
    },
    units: [{
      id: "00000000-0000-4000-8000-000000000106",
      title: "First contacts",
      theme: "Introductions",
      description: "Meet people.",
      estimated_minutes: 12,
      lessons: [{
        id: "00000000-0000-4000-8000-000000000107",
        title: "Say hello",
        description: "Use a greeting.",
        estimated_minutes: 12,
        objectives: [{
          id: "00000000-0000-4000-8000-000000000108",
          description: "Recognize a greeting.",
          success_criteria: "Identify a greeting in context.",
        }],
      }],
    }],
  };

  const fetchImpl = async (url, options) => {
    const parsedUrl = new URL(url);
    const method = options.method || "GET";
    const requestBody = options.body ? JSON.parse(options.body) : undefined;
    const token = options.headers.authorization;
    calls.push({
      method,
      pathname: parsedUrl.pathname,
      query: parsedUrl.searchParams,
      body: requestBody,
      token,
    });

    if (parsedUrl.pathname === "/api/v1/auth/login" && method === "POST") {
      return jsonResponse({
        access_token: requestBody.email === "editor@example.test" ? editorToken : nonEditorToken,
      });
    }

    if (parsedUrl.pathname === "/api/v1/curriculum/editor/versions" && method === "GET") {
      if (token === `Bearer ${nonEditorToken}`) {
        return jsonResponse(
          { code: "CURRICULUM_FORBIDDEN", message: "Editorial permission required." },
          403,
        );
      }
      const status = parsedUrl.searchParams.get("status");
      const versionStatus = status === "published" ? "published" : "draft";
      const updatedAt = versionStatus === "published"
        ? "2026-11-20 19:15:00+00"
        : draftQueueReads++ === 0
          ? "2026-11-20 19:00:00+00"
          : "2026-11-20 19:10:00+00";
      return jsonResponse({
        items: [{
          course_version_id: courseVersionId,
          slug,
          status: versionStatus,
          updated_at: updatedAt,
        }],
        total: 1,
        page: 1,
        page_size: 10,
        total_pages: 1,
      });
    }

    if (parsedUrl.pathname === "/api/v1/curriculum/editor/import" && method === "POST") {
      return jsonResponse({
        state: "imported",
        course_version_id: courseVersionId,
        package_sha256: "a".repeat(64),
        units: 1,
        lessons: 1,
        objectives: 1,
        vocabulary_references: 0,
        sentence_references: 0,
        applied: requestBody.apply,
        dry_run: !requestBody.apply,
      });
    }

    if (parsedUrl.pathname === `/api/v1/curriculum/courses/${courseVersionId}` && method === "GET") {
      const courseDetail = structuredClone(detail);
      if (editorialActions >= 5) courseDetail.course.status = "published";
      return jsonResponse(courseDetail);
    }

    if (parsedUrl.pathname.endsWith(`/${courseVersionId}/draft`) && method === "PUT") {
      draftSaves += 1;
      if (draftSaves === 2 || draftSaves === 4) {
        return jsonResponse(
          { code: "CURRICULUM_STATE_CONFLICT", message: "The draft changed or is no longer editable." },
          409,
        );
      }
      return jsonResponse({
        course_version_id: courseVersionId,
        updated_at: draftSaves === 1
          ? "2026-11-20 19:05:00+00"
          : "2026-11-20 19:12:00+00",
        revision_number: draftSaves === 1 ? 1 : 2,
        content_sha256: (draftSaves === 1 ? "b" : "c").repeat(64),
      });
    }

    if (parsedUrl.pathname.endsWith(`/${courseVersionId}/actions`) && method === "POST") {
      editorialActions += 1;
      const transitions = [
        ["submit", "review"],
        ["review", "draft"],
        ["submit", "review"],
        ["review", "review"],
        ["publish", "published"],
      ];
      const [expectedAction, nextStatus] = transitions[editorialActions - 1];
      assert.equal(requestBody.action, expectedAction);
      return jsonResponse({
        course_version_id: courseVersionId,
        action: expectedAction,
        previous_status: editorialActions === 1 ? "draft" : "review",
        next_status: nextStatus,
      });
    }

    if (parsedUrl.pathname === "/api/v1/curriculum/courses" && method === "GET") {
      return jsonResponse({
        items: [{
          course_version_id: courseVersionId,
          slug,
          status: "published",
        }],
        total: 1,
        page: 1,
        page_size: 50,
        total_pages: 1,
      });
    }

    throw new Error(`Unexpected request: ${method} ${parsedUrl.pathname}`);
  };

  return { fetchImpl, calls };
}

test("live acceptance flow covers authorization, dry-run, import, concurrency, review and published lock", async () => {
  const { fetchImpl, calls } = createAcceptanceFetch();
  const result = await runCurriculumAdminAcceptance({
    apiBaseUrl: "https://staging.example.test",
    environment: "staging",
    editorCredentials: { email: "editor@example.test", password: "editor-secret" },
    nonEditorCredentials: { email: "student@example.test", password: "student-secret" },
    packageText: samplePackage,
    fetchImpl,
    runId: "deadbeef0011",
  });

  assert.deepEqual(result, {
    courseSlug: slug,
    courseVersionId,
    previewWasDryRun: true,
    draftRevision: 2,
    published: true,
    postPublicationEditRejected: true,
    nonEditorDenied: true,
  });
  assert.equal(calls.filter((call) => call.pathname === "/api/v1/auth/login").length, 2);
  assert.equal(calls.filter((call) => call.pathname === "/api/v1/curriculum/editor/import").length, 2);
  assert.equal(calls.filter((call) => call.pathname.endsWith("/draft") && call.method === "PUT").length, 4);
  assert.equal(calls.filter((call) => call.pathname.endsWith("/actions") && call.method === "POST").length, 5);
  assert.ok(
    calls.some(
      (call) =>
        call.pathname === "/api/v1/curriculum/editor/import" &&
        call.token === `Bearer ${editorToken}`,
    ),
    "La importación debe estar autenticada con la cuenta editorial.",
  );
  assert.ok(
    calls.some(
      (call) =>
        call.pathname === "/api/v1/curriculum/editor/versions" &&
        call.token === `Bearer ${nonEditorToken}`,
    ),
    "La comprobación 403 debe usar la cuenta sin permiso editorial.",
  );
});

test("live acceptance refuses production, even when staging mode is accidentally set", async () => {
  await assert.rejects(
    runCurriculumAdminAcceptance({
      apiBaseUrl: "https://app-ingles.jnmtortas.com",
      environment: "staging",
      editorCredentials: { email: "editor@example.test", password: "secret" },
      nonEditorCredentials: { email: "student@example.test", password: "secret" },
      packageText: samplePackage,
      fetchImpl: async () => {
        throw new Error("The production guard must stop before making a request.");
      },
    }),
    /host de producción está bloqueado/,
  );
});

test("live acceptance requires an explicit staging target and HTTPS", async () => {
  await assert.rejects(
    runCurriculumAdminAcceptance({
      apiBaseUrl: "https://staging.example.test",
      environment: "production",
      editorCredentials: { email: "editor@example.test", password: "secret" },
      nonEditorCredentials: { email: "student@example.test", password: "secret" },
      packageText: samplePackage,
    }),
    /CURRICULUM_ACCEPTANCE_ENV=staging/,
  );

  await assert.rejects(
    runCurriculumAdminAcceptance({
      apiBaseUrl: "http://staging.example.test",
      environment: "staging",
      editorCredentials: { email: "editor@example.test", password: "secret" },
      nonEditorCredentials: { email: "student@example.test", password: "secret" },
      packageText: samplePackage,
    }),
    /solo admite un endpoint HTTPS/,
  );
});
