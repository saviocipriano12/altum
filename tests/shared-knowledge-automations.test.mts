import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("social replies use the tenant knowledge base instead of a channel-only script", async () => {
  const service = await source("lib/server/social/service.ts");

  assert.match(service, /async function getSocialKnowledgeSummary/);
  assert.match(service, /collection\("kb_docs"\)\.where\("tenantId", "==", tenantId\)/);
  assert.match(service, /Base oficial da empresa/);
  assert.match(service, /Nunca invente preco, estoque, prazo, politica ou promessa/);
});

test("automation screens present knowledge as shared across channels", async () => {
  const automations = await source("app/cliente/painel/automacoes/page.tsx");
  const instagram = await source("app/cliente/painel/automacoes/instagram/page.tsx");

  assert.match(automations, /Uma base para todos os canais/);
  assert.match(instagram, /Conhecimento unico da empresa/);
  assert.match(instagram, /Comece por um modelo/);
  assert.match(instagram, /Ajustes locais do Instagram/);
});

