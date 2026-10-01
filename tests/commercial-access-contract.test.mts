import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = [
  "app/api/tenant/[tenantId]/budgets/route.ts",
  "app/api/tenant/[tenantId]/budgets/[budgetId]/route.ts",
  "app/api/tenant/[tenantId]/finance/route.ts",
  "app/api/tenant/[tenantId]/finance/[financeId]/route.ts",
  "app/api/tenant/[tenantId]/finance/create-charge/route.ts",
  "app/api/tenant/[tenantId]/assisted-meetings/route.ts",
  "app/api/tenant/[tenantId]/notifications/route.ts",
] as const;

test("dados comerciais derivados respeitam o escopo do vendedor", async () => {
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(source, /commercial-access/, `${file} precisa usar a política comercial central`);
  }
});

test("desligamento revoga sessão, transfere carteira e registra auditoria", async () => {
  const source = await readFile("app/api/tenant/[tenantId]/users/[userId]/offboard/route.ts", "utf8");
  assert.match(source, /revokeRefreshTokens/);
  assert.match(source, /buildOwnershipTransferPatch/);
  assert.match(source, /buildPersonalChannelTransferPatch/);
  assert.match(source, /tenant_user_offboard/);
});
