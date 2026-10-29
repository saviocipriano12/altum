import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.ALTUM_QA_BASE_URL || "http://127.0.0.1:3000";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(baseURL)) {
  throw new Error("Altum QA Lab blocks non-local targets. Use a local test server.");
}
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30000,
  expect: { timeout: 10000 },
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: ".qa-artifacts/playwright-report", open: "never" }]],
  outputDir: ".qa-artifacts/playwright-results",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
  ],
});
