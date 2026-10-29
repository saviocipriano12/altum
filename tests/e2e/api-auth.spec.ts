import { test, expect } from "@playwright/test";

test("unauthenticated caller cannot read tenant CRM", async ({ request }) => {
  const response = await request.get("/api/tenant/qa-lab-isolated-example/leads");
  expect([401, 403, 404]).toContain(response.status());
  const body = await response.text();
  expect(body).not.toMatch(/"leads"\s*:\s*\[\s*\{/);
});

test("unauthenticated caller cannot read tenant conversations", async ({ request }) => {
  const response = await request.get("/api/tenant/qa-lab-isolated-example/chats");
  expect([401, 403, 404]).toContain(response.status());
});
