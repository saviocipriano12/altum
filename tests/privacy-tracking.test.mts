import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("analytics exige consentimento e bloqueia superficies autenticadas", async () => {
  const tracking = await source("components/analytics/TrackingScripts.tsx");

  assert.match(tracking, /consent === "granted"/);
  assert.match(tracking, /TRACKING_BLOCKED_PREFIXES = \["\/admin", "\/cliente", "\/api"\]/);
  assert.match(tracking, /TRACKING_BLOCKED_PATHS = new Set\(\["\/login", "\/cadastro"\]\)/);
  assert.match(tracking, /page_location: `\$\{window\.location\.origin\}\$\{pathname\}`/);
  assert.doesNotMatch(tracking, /searchParams|window\.location\.href/);
  assert.match(tracking, /Recusar opcionais/);
  assert.match(tracking, /Preferências de cookies/);
  assert.match(tracking, /updatedAt: new Date\(\)\.toISOString\(\)/);
});

test("URLs publicas removem espacos do ambiente e usam o dominio canonico", async () => {
  const [schema, sitemap, robots, layout] = await Promise.all([
    source("lib/schema.ts"),
    source("app/sitemap.ts"),
    source("app/robots.ts"),
    source("app/layout.tsx"),
  ]);

  for (const content of [schema, sitemap, robots, layout]) {
    assert.match(content, /altumia\.com\.br/);
    assert.match(content, /\.trim\(\)/);
  }
});
