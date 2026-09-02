import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("guided tour advances highlights without navigating on every next click", async () => {
  const tour = await source("app/cliente/painel/components/cliente-guided-tour.tsx");
  assert.match(tour, /setStep\(\(value\) => value \+ 1\)/);
  assert.doesNotMatch(tour, /pathname !== current\.route/);
  assert.doesNotMatch(tour, /router\.push\(current\.route/);
  assert.match(tour, /function openArea\(\)/);
  assert.match(tour, /transition-\[left,top,width,height\]/);
});

test("activation center derives progress from real tenant readiness", async () => {
  const activation = await source("app/cliente/painel/components/cliente-activation-center.tsx");
  assert.match(activation, /useTenantReadiness/);
  assert.match(activation, /Proximo passo recomendado/);
  assert.match(activation, /activeAutomations/);
  assert.match(activation, /pilotReady/);
});

test("client shell avoids artificial opening delay and prefetches main navigation", async () => {
  const guard = await source("app/cliente/ClientePanelGuard.tsx");
  const sidebar = await source("app/cliente/painel/components/cliente-sidebar.tsx");
  assert.doesNotMatch(guard, /remainingOpeningTime|850 -/);
  assert.match(guard, /cachedTenantSession/);
  assert.doesNotMatch(sidebar, /prefetch=\{false\}/);
});
