#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PRODUCTION_HOST = "app-ingles.jnmtortas.com";

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

function productionOrigin(value) {
  const url = new URL(required(value, "CURRICULUM_API_BASE_URL"));
  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== PRODUCTION_HOST ||
    url.username ||
    url.password ||
    (url.pathname !== "/" && url.pathname !== "") ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `La aceptación de solo lectura solo admite el origen HTTPS oficial de producción: https://${PRODUCTION_HOST}`,
    );
  }
  return url.origin;
}

async function requestJson(fetchImpl, baseUrl, token, method, route, body, expectedStatus = 200) {
  const headers = { accept: "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";

  const response = await fetchImpl(new URL(route, baseUrl), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
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
    const detail = typeof payload?.message === "string" ? payload.message : "sin detalle";
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

/**
 * Production-safe curriculum acceptance. It creates normal login sessions and
 * performs GET requests only after authentication. It never imports, edits,
 * reviews, publishes, archives, or deletes curriculum data.
 */
export async function runProductionReadonlyAcceptance({
  apiBaseUrl,
  editorCredentials,
  nonEditorCredentials,
  fetchImpl = fetch,
}) {
  const baseUrl = productionOrigin(apiBaseUrl);
  const editorEmail = required(editorCredentials?.email, "CURRICULUM_EDITOR_EMAIL");
  const studentEmail = required(nonEditorCredentials?.email, "CURRICULUM_NON_EDITOR_EMAIL");
  if (editorEmail.toLowerCase() === studentEmail.toLowerCase()) {
    throw new Error("La cuenta editorial y la cuenta sin permisos deben ser usuarios distintos.");
  }

  const editorToken = await login(fetchImpl, baseUrl, {
    email: editorEmail,
    password: requiredSecret(editorCredentials?.password, "CURRICULUM_EDITOR_PASSWORD"),
  }, "editor");
  const studentToken = await login(fetchImpl, baseUrl, {
    email: studentEmail,
    password: requiredSecret(nonEditorCredentials?.password, "CURRICULUM_NON_EDITOR_PASSWORD"),
  }, "estudiante sin permisos");

  const forbidden = await requestJson(
    fetchImpl,
    baseUrl,
    studentToken,
    "GET",
    "/api/v1/curriculum/editor/versions?page=1&page_size=10",
    undefined,
    403,
  );
  assert.equal(typeof forbidden?.code, "string", "El 403 debe ser explícito y tipado.");

  const editorialQueue = await requestJson(
    fetchImpl,
    baseUrl,
    editorToken,
    "GET",
    "/api/v1/curriculum/editor/versions?page=1&page_size=10",
  );
  assert.ok(Array.isArray(editorialQueue?.items), "La cola editorial debe devolver items.");
  assert.ok(Number.isInteger(editorialQueue?.total), "La cola debe devolver el total.");
  assert.ok(Number.isInteger(editorialQueue?.page), "La cola debe devolver la página actual.");
  assert.ok(Number.isInteger(editorialQueue?.page_size), "La cola debe devolver el tamaño de página.");

  const studentCatalog = await requestJson(
    fetchImpl,
    baseUrl,
    studentToken,
    "GET",
    "/api/v1/curriculum/courses?page=1&page_size=50",
  );
  assert.ok(Array.isArray(studentCatalog?.items), "El catálogo estudiantil debe devolver items.");
  assert.ok(Number.isInteger(studentCatalog?.total), "El catálogo debe devolver el total.");

  const detailsChecked = [];
  for (const item of studentCatalog.items.slice(0, 10)) {
    const id = item?.course_version_id;
    assert.equal(typeof id, "string", "Cada curso publicado debe incluir course_version_id.");
    if (item.status !== undefined) {
      assert.equal(item.status, "published", "El catálogo del estudiante no debe exponer borradores.");
    }
    const detail = await requestJson(
      fetchImpl,
      baseUrl,
      studentToken,
      "GET",
      `/api/v1/curriculum/courses/${encodeURIComponent(id)}`,
    );
    assert.equal(detail?.course?.course_version_id, id, "El detalle debe corresponder a la versión solicitada.");
    assert.equal(detail?.course?.status, "published", "El estudiante solo debe recibir versiones publicadas.");
    assert.ok(Array.isArray(detail?.units), "El detalle publicado debe contener la colección de unidades.");
    detailsChecked.push(id);
  }

  return {
    productionOrigin: baseUrl,
    editorLogin: "passed",
    nonEditorLogin: "passed",
    nonEditorEditorialAccess: "403",
    editorQueueReadable: true,
    editorialQueueItems: editorialQueue.items.length,
    studentCatalogReadable: true,
    publishedCatalogItems: studentCatalog.items.length,
    courseDetailsChecked: detailsChecked.length,
    courseVersionIdsChecked: detailsChecked,
    contentMutations: 0,
  };
}

async function main() {
  const result = await runProductionReadonlyAcceptance({
    apiBaseUrl: process.env.CURRICULUM_API_BASE_URL,
    editorCredentials: {
      email: process.env.CURRICULUM_EDITOR_EMAIL,
      password: process.env.CURRICULUM_EDITOR_PASSWORD,
    },
    nonEditorCredentials: {
      email: process.env.CURRICULUM_NON_EDITOR_EMAIL,
      password: process.env.CURRICULUM_NON_EDITOR_PASSWORD,
    },
  });
  console.log("Production read-only curriculum acceptance passed:");
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Production read-only curriculum acceptance failed: ${error.message}`);
    process.exitCode = 1;
  });
}
