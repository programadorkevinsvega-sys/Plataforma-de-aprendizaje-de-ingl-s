import assert from "node:assert/strict";
import test from "node:test";
import { runProductionReadonlyAcceptance } from "../production-readonly-acceptance.mjs";

const productionUrl = "https://app-ingles.jnmtortas.com";

function createFetch() {
  const calls = [];
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    calls.push({
      path: parsed.pathname,
      method: options.method,
      token: options.headers.authorization ?? null,
      body: options.body ? JSON.parse(options.body) : null,
    });

    if (parsed.pathname === "/api/v1/auth/login" && options.method === "POST") {
      const email = JSON.parse(options.body).email;
      return Response.json({
        access_token: email === "editor@example.test"
          ? "editor-access-token-that-is-long-enough"
          : "student-access-token-that-is-long-enough",
      });
    }
    if (
      parsed.pathname === "/api/v1/curriculum/editor/versions" &&
      options.method === "GET" &&
      options.headers.authorization?.startsWith("Bearer student-")
    ) {
      return Response.json({ code: "CURRICULUM_FORBIDDEN", message: "Forbidden" }, { status: 403 });
    }
    if (parsed.pathname === "/api/v1/curriculum/editor/versions" && options.method === "GET") {
      return Response.json({ items: [], total: 0, page: 1, page_size: 10, total_pages: 0 });
    }
    if (parsed.pathname === "/api/v1/curriculum/courses" && options.method === "GET") {
      return Response.json({
        items: [{ course_version_id: "version-1", status: "published" }],
        total: 1,
        page: 1,
        page_size: 50,
        total_pages: 1,
      });
    }
    if (parsed.pathname === "/api/v1/curriculum/courses/version-1" && options.method === "GET") {
      return Response.json({
        course: { course_version_id: "version-1", status: "published" },
        units: [{ id: "unit-1" }],
      });
    }
    throw new Error(`Unexpected request: ${options.method} ${parsed.pathname}`);
  };
  return { fetchImpl, calls };
}

test("production acceptance logs in two real identities and performs only read-only curriculum requests", async () => {
  const { fetchImpl, calls } = createFetch();
  const result = await runProductionReadonlyAcceptance({
    apiBaseUrl: productionUrl,
    editorCredentials: { email: "editor@example.test", password: "editor-secret" },
    nonEditorCredentials: { email: "student@example.test", password: "student-secret" },
    fetchImpl,
  });

  assert.deepEqual(result, {
    productionOrigin: productionUrl,
    editorLogin: "passed",
    nonEditorLogin: "passed",
    nonEditorEditorialAccess: "403",
    editorQueueReadable: true,
    editorialQueueItems: 0,
    studentCatalogReadable: true,
    publishedCatalogItems: 1,
    courseDetailsChecked: 1,
    courseVersionIdsChecked: ["version-1"],
    contentMutations: 0,
  });
  assert.deepEqual(
    calls.filter((call) => call.method === "POST").map((call) => call.path),
    ["/api/v1/auth/login", "/api/v1/auth/login"],
  );
  assert.ok(calls.filter((call) => call.path !== "/api/v1/auth/login").every((call) => call.method === "GET"));
  assert.equal(calls.filter((call) => call.path === "/api/v1/curriculum/editor/versions").length, 2);
});

test("production acceptance refuses any non-production origin before logging in", async () => {
  let called = false;
  await assert.rejects(
    runProductionReadonlyAcceptance({
      apiBaseUrl: "https://staging.example.test",
      editorCredentials: { email: "editor@example.test", password: "secret" },
      nonEditorCredentials: { email: "student@example.test", password: "secret" },
      fetchImpl: async () => {
        called = true;
        throw new Error("Must not be called");
      },
    }),
    /solo admite el origen HTTPS oficial de producción/,
  );
  assert.equal(called, false);
});

test("production acceptance refuses to reuse one identity for both roles", async () => {
  let called = false;
  await assert.rejects(
    runProductionReadonlyAcceptance({
      apiBaseUrl: productionUrl,
      editorCredentials: { email: "same@example.test", password: "secret" },
      nonEditorCredentials: { email: "SAME@example.test", password: "secret" },
      fetchImpl: async () => {
        called = true;
        throw new Error("Must not be called");
      },
    }),
    /deben ser usuarios distintos/,
  );
  assert.equal(called, false);
});
