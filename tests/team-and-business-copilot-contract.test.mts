import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

test("owner deletion preserves the operation before removing tenant membership", () => {
  const route = source("app/api/tenant/[tenantId]/users/[userId]/route.ts");
  assert.match(route, /export async function DELETE/);
  assert.match(route, /client_owner.*agency_owner.*agency_admin/);
  assert.match(route, /actor\.uid === userId/);
  assert.match(route, /confirmation !== targetEmail/);
  assert.match(route, /buildOwnershipTransferPatch/);
  assert.match(route, /buildPersonalChannelTransferPatch/);
  assert.match(route, /finalBatch\.delete\(ref\)/);
  assert.match(route, /revokeRefreshTokens/);
  assert.match(route, /tenant_user_delete/);
});

test("team page separates team removal, offboarding and company deletion", () => {
  const page = source("app/cliente/painel/configuracoes/times/page.tsx");
  assert.match(page, /Remover do time/);
  assert.match(page, /Desligar acesso/);
  assert.match(page, /Excluir da empresa/);
  assert.match(page, /confirmation: string/);
});

test("business copilot uses provider failover and authorized personal scope", () => {
  const route = source("app/api/tenant/[tenantId]/business-insights/ask/route.ts");
  const copilot = source("lib/server/ai/business-copilot.ts");
  assert.match(route, /canAccessAssignedCommercialRecord/);
  assert.match(route, /scope: teamWideAccess \? "company" : "personal"/);
  assert.match(route, /runBusinessCopilot/);
  assert.match(copilot, /"openai", "gemini", "mistral", "anthropic"/);
  assert.match(copilot, /for \(let index = 0; index < providers\.length/);
  assert.match(copilot, /unavailableReason/);
});
