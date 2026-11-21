import path from "node:path";

const { defineConfig } = await import(
  process.env.PLAYWRIGHT_TEST_MODULE || "@playwright/test"
);

export default defineConfig({
  testDir: path.dirname(new URL(import.meta.url).pathname),
  testMatch: "curriculum-admin.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  outputDir: path.join(process.env.RUNNER_TEMP || process.cwd(), "curriculum-admin-e2e-results"),
  use: {
    baseURL: "http://127.0.0.1:3000",
    browserName: "chromium",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm --filter devfluency-frontend start",
    url: "http://127.0.0.1:3000/login",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_BFF_URL: process.env.NEXT_PUBLIC_BFF_URL || "https://bff-ci.invalid",
    },
  },
});
