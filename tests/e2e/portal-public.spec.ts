import { test, expect } from "@playwright/test";

test("client login loads and exposes authentication controls", async ({ page }) => {
  const response = await page.goto("/cliente/login", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(500);
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
});

test("anonymous portal navigation cannot reveal commercial data", async ({ page }) => {
  await page.goto("/cliente/painel/crm", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const visible = (await page.locator("body").innerText()).toLowerCase();
  expect(visible).not.toContain("marina@clinicaauroraprime.com.br");
  await expect(page.locator("body")).not.toBeEmpty();
});
