const { test, expect } = require(
  process.env.PLAYWRIGHT_TEST_MODULE || "@playwright/test",
);

const SESSION_KEY = "devfluency.session";
const TOKEN = "e2e-editor-session-token-with-sufficient-length";
const USER_ID = "00000000-0000-4000-8000-000000000901";
const VERSION_ID = "00000000-0000-4000-8000-000000000902";
const UNIT_ID = "00000000-0000-4000-8000-000000000903";
const LESSON_ID = "00000000-0000-4000-8000-000000000904";
const OBJECTIVE_ID = "00000000-0000-4000-8000-000000000905";

function createSession() {
  return {
    accessToken: TOKEN,
    refreshToken: null,
    expiresAt: null,
    tenantId: USER_ID,
    user: {
      id: USER_ID,
      email: "editor@example.test",
      fullName: "Editorial E2E",
      targetRole: "BACKEND",
      currentLevel: "A1",
      tenantId: USER_ID,
      streakDays: 0,
      techCoins: 0,
    },
  };
}

async function seedSession(page) {
  await page.addInitScript(
    ({ key, session }) => {
      window.sessionStorage.setItem(key, JSON.stringify(session));
    },
    { key: SESSION_KEY, session: createSession() },
  );
}

function json(route, status, payload) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

async function installCommonBffMocks(page, options = {}) {
  const { denyEditorial = false, versionsHandler } = options;
  const requests = [];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    const body = method === "GET" ? null : request.postDataJSON();
    requests.push({ method, pathname, search: url.searchParams, body, headers: request.headers() });

    if (pathname === "/api/v1/auth/me" && method === "GET") {
      return json(route, 200, {
        user: {
          id: USER_ID,
          email: "editor@example.test",
          full_name: "Editorial E2E",
          target_role: "BACKEND",
          current_level: "A1",
          tenant_id: USER_ID,
          streak_days: 0,
          tech_coins: 0,
        },
      });
    }

    if (pathname === "/api/v1/progress/summary" && method === "GET") {
      return json(route, 200, {
        summary: { xp: 0, streak_days: 0, tech_coins: 0 },
      });
    }

    if (pathname === "/api/v1/curriculum/editor/versions" && method === "GET") {
      if (denyEditorial) {
        return json(route, 403, {
          code: "CURRICULUM_FORBIDDEN",
          message: "Tu cuenta no tiene permiso editorial.",
        });
      }
      if (versionsHandler) return versionsHandler(route, url);
      return json(route, 200, {
        items: [],
        total: 0,
        page: Number(url.searchParams.get("page") || 1),
        page_size: Number(url.searchParams.get("page_size") || 10),
        total_pages: 0,
      });
    }

    return json(route, 404, {
      code: "E2E_UNEXPECTED_ENDPOINT",
      message: `Endpoint no configurado en E2E: ${method} ${pathname}`,
    });
  });

  return requests;
}

function versionSummary({ id, slug, title, status, updatedAt, latestDecision = "", canPublish = false }) {
  return {
    course_version_id: id,
    slug,
    track_code: "general",
    cefr_level: "PRE_A1",
    version_number: 1,
    status,
    title,
    description: "Contenido de aceptación visual.",
    imported_at: "2026-11-20T12:00:00Z",
    package_sha256: "a".repeat(64),
    latest_decision: latestDecision,
    latest_comments: "",
    latest_reviewer_id: "",
    can_publish: canPublish,
    updated_at: updatedAt,
  };
}

function curriculumDetail(status = "draft") {
  return {
    course: {
      course_version_id: VERSION_ID,
      slug: "english-general-e2e",
      track_code: "general",
      cefr_level: "PRE_A1",
      version_number: 1,
      title: "English General E2E",
      description: "Initial course description.",
      unit_count: 1,
      lesson_count: 1,
      estimated_minutes: 20,
      enrolled: false,
      status,
    },
    units: [{
      id: UNIT_ID,
      position: 1,
      title: "First contacts",
      theme: "Introductions",
      description: "Meet people in simple situations.",
      estimated_minutes: 20,
      lessons: [{
        id: LESSON_ID,
        lesson_code: "greetings-01",
        position: 1,
        lesson_pattern: "discover",
        title: "Say hello",
        description: "Use a greeting.",
        estimated_minutes: 20,
        objectives: [{
          id: OBJECTIVE_ID,
          objective_code: "greetings.identify",
          description: "Recognize basic greetings.",
          success_criteria: "Identify a suitable greeting in context.",
          position: 1,
          required: true,
          skills: ["vocabulary"],
        }],
        prerequisites: [],
        progress: null,
      }],
    }],
  };
}

test("sin sesión, la administración redirige al login", async ({ page }) => {
  await page.goto("/admin/curriculum");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "DevFluency AI" })).toBeVisible();
});

test("una cuenta autenticada sin permiso editorial ve el 403 y nunca una cola vacía", async ({ page }) => {
  await seedSession(page);
  await installCommonBffMocks(page, { denyEditorial: true });

  await page.goto("/admin/curriculum");

  await expect(
    page.getByRole("heading", { name: "Tu cuenta no tiene acceso editorial" }),
  ).toBeVisible();
  await expect(page.getByText("No hay versiones curriculares para estos filtros.")).toHaveCount(0);
});

test("la cola editorial navega páginas, aplica búsqueda y filtra por estado", async ({ page }) => {
  await seedSession(page);
  const versions = Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    const status = number === 11 ? "review" : number === 12 ? "published" : "draft";
    return versionSummary({
      id: `00000000-0000-4000-8000-${String(910 + number).padStart(12, "0")}`,
      slug: `english-general-${String(number).padStart(2, "0")}`,
      title: `Curso ${String(number).padStart(2, "0")}`,
      status,
      updatedAt: `2026-11-20T12:${String(number).padStart(2, "0")}:00Z`,
      latestDecision: status === "review" ? "changes_requested" : "",
      canPublish: false,
    });
  });

  const requests = await installCommonBffMocks(page, {
    versionsHandler: async (route, url) => {
      const pageNumber = Number(url.searchParams.get("page") || 1);
      const status = url.searchParams.get("status");
      const search = (url.searchParams.get("search") || "").toLocaleLowerCase();
      let filtered = versions;
      if (status) filtered = filtered.filter((item) => item.status === status);
      if (search) {
        filtered = filtered.filter(
          (item) =>
            item.title.toLocaleLowerCase().includes(search) ||
            item.slug.toLocaleLowerCase().includes(search),
        );
      }
      const pageSize = 10;
      const start = (pageNumber - 1) * pageSize;
      const items = filtered.slice(start, start + pageSize);
      return json(route, 200, {
        items,
        total: filtered.length,
        page: pageNumber,
        page_size: pageSize,
        total_pages: Math.ceil(filtered.length / pageSize),
      });
    },
  });

  await page.goto("/admin/curriculum");

  await expect(page.getByRole("heading", { name: "Curso 01" })).toBeVisible();
  await expect(page.getByText("Página 1 de 2 · 12 versiones")).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Curso 11" })).toBeVisible();
  await expect(page.getByText("Página 2 de 2 · 12 versiones")).toBeVisible();

  const search = page.getByPlaceholder("Buscar curso…");
  await search.fill("Curso 11");
  await expect(page.getByRole("heading", { name: "Curso 11" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Curso 12" })).toHaveCount(0);

  await page.locator('section[aria-label="Cola de revisión curricular"] select').selectOption("review");
  await expect(page.getByRole("heading", { name: "Curso 11" })).toBeVisible();
  await expect(page.getByText("En revisión").first()).toBeVisible();

  const queueCalls = requests.filter((item) => item.pathname === "/api/v1/curriculum/editor/versions");
  expect(queueCalls.some((item) => item.search.get("page") === "2")).toBeTruthy();
  expect(queueCalls.some((item) => item.search.get("search") === "Curso 11")).toBeTruthy();
  expect(queueCalls.some((item) => item.search.get("status") === "review")).toBeTruthy();
});

test("la interfaz importa, edita, tramita cambios, aprueba y publica un borrador", async ({ page }) => {
  await seedSession(page);

  let status = "draft";
  let latestDecision = "";
  let latestComments = "";
  let updatedAt = "2026-11-20T12:00:00Z";
  let revision = 0;
  const actionCalls = [];
  const importCalls = [];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pathname = url.pathname;
    const body = method === "GET" ? null : request.postDataJSON();

    if (pathname === "/api/v1/auth/me" && method === "GET") {
      return json(route, 200, {
        user: {
          id: USER_ID,
          email: "editor@example.test",
          full_name: "Editorial E2E",
          target_role: "BACKEND",
          current_level: "A1",
          tenant_id: USER_ID,
          streak_days: 0,
          tech_coins: 0,
        },
      });
    }
    if (pathname === "/api/v1/progress/summary" && method === "GET") {
      return json(route, 200, { summary: { xp: 0, streak_days: 0, tech_coins: 0 } });
    }
    if (pathname === "/api/v1/curriculum/editor/versions" && method === "GET") {
      return json(route, 200, {
        items: [versionSummary({
          id: VERSION_ID,
          slug: "english-general-e2e",
          title: "English General E2E",
          status,
          updatedAt,
          latestDecision,
          canPublish: status === "review" && latestDecision === "approved",
        })],
        total: 1,
        page: Number(url.searchParams.get("page") || 1),
        page_size: 10,
        total_pages: 1,
      });
    }
    if (pathname === "/api/v1/curriculum/editor/import" && method === "POST") {
      importCalls.push(body);
      const apply = body.apply === true;
      return json(route, 200, {
        state: "imported",
        course_version_id: VERSION_ID,
        package_sha256: "b".repeat(64),
        units: 1,
        lessons: 1,
        objectives: 1,
        vocabulary_references: 3,
        sentence_references: 2,
        applied: apply,
        dry_run: !apply,
      });
    }
    if (pathname === `/api/v1/curriculum/courses/${VERSION_ID}` && method === "GET") {
      return json(route, 200, curriculumDetail(status));
    }
    if (pathname === `/api/v1/curriculum/editor/versions/${VERSION_ID}/draft` && method === "PUT") {
      revision += 1;
      updatedAt = `2026-11-20T12:0${revision}:00Z`;
      return json(route, 200, {
        course_version_id: VERSION_ID,
        updated_at: updatedAt,
        revision_number: revision,
        content_sha256: "c".repeat(64),
      });
    }
    if (pathname === `/api/v1/curriculum/editor/versions/${VERSION_ID}/actions` && method === "POST") {
      actionCalls.push(body);
      const previous = status;
      if (body.action === "submit") {
        status = "review";
        latestDecision = "";
        latestComments = "";
      } else if (body.action === "review") {
        latestDecision = body.decision;
        latestComments = body.comments || "";
        if (body.decision === "changes_requested" || body.decision === "rejected") {
          status = "draft";
        }
      } else if (body.action === "publish" && latestDecision === "approved") {
        status = "published";
      }
      return json(route, 200, {
        course_version_id: VERSION_ID,
        action: body.action,
        previous_status: previous,
        next_status: status,
        review_id: "00000000-0000-4000-8000-000000000906",
        reviewed_at: "2026-11-20T12:10:00Z",
      });
    }
    return json(route, 404, {
      code: "E2E_UNEXPECTED_ENDPOINT",
      message: `Endpoint no configurado en E2E: ${method} ${pathname}`,
    });
  });

  await page.goto("/admin/curriculum");

  await page.getByPlaceholder(/Pega aquí el paquete/).fill(JSON.stringify({
    format: "devfluency.curriculum-content",
    schema_version: 1,
    metadata: { author: "Browser E2E", authored_at: "2026-11-20", source: { name: "Fixture", license: "original" } },
    course: { slug: "english-general-e2e", track_code: "general" },
    version: { version_number: 1, cefr_level: "PRE_A1", title: "English General E2E", description: "", locale: "en" },
  }));
  await page.getByRole("button", { name: "Validar y previsualizar" }).click();
  await expect(page.getByRole("heading", { name: "Resultado de previsualización" })).toBeVisible();
  await expect(page.getByText("Dry-run · rollback")).toBeVisible();
  await expect(page.getByText("Referencias de vocabulario")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar importación como borrador" })).toBeEnabled();
  await page.getByRole("button", { name: "Confirmar importación como borrador" }).click();
  await expect(page.getByText(/Paquete importado correctamente como borrador/)).toBeVisible();
  expect(importCalls.map((call) => call.apply)).toEqual([false, true]);

  await page.getByRole("button", { name: "Editar borrador" }).click();
  const courseTitle = page.getByLabel("Título del curso");
  await expect(courseTitle).toHaveValue("English General E2E");
  await courseTitle.fill("English General E2E — Revised");
  await page.getByRole("button", { name: "Guardar cambios del borrador" }).click();
  await expect(page.getByText(/Borrador guardado · revisión 1 · SHA-256 c{16}/)).toBeVisible();

  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await expect(page.getByText("En revisión").first()).toBeVisible();
  await page.getByPlaceholder(/Registra observaciones concretas/).fill("Clarify the lesson success criteria.");
  await page.getByRole("button", { name: "Solicitar cambios" }).click();
  await expect(page.getByText("Borrador", { exact: true }).first()).toBeVisible();

  await page.getByRole("button", { name: "Editar borrador" }).click();
  await page.getByLabel("Criterio de éxito").fill("Learners identify and use a greeting in context.");
  await page.getByRole("button", { name: "Guardar cambios del borrador" }).click();
  await expect(page.getByText(/Borrador guardado · revisión 2 · SHA-256 c{16}/)).toBeVisible();

  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await page.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("button", { name: "Publicar versión aprobada" })).toBeVisible();
  await page.getByRole("button", { name: "Publicar versión aprobada" }).click();
  await expect(page.getByText("Publicado", { exact: true }).first()).toBeVisible();

  expect(actionCalls.map((call) => [call.action, call.decision || null])).toEqual([
    ["submit", null],
    ["review", "changes_requested"],
    ["submit", null],
    ["review", "approved"],
    ["publish", null],
  ]);
  expect(actionCalls[1].comments).toContain("success criteria");
  expect(status).toBe("published");
});
