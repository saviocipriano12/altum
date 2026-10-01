import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { filterLeadOwners, type TenantOperator } from "../lib/inbox-routing-policy.ts";

const base = {
  team: "comercial",
  teamId: "comercial",
  availability: "online" as const,
  allowedChannels: [],
  maxOpenChats: null,
};

test("conversation operators may include support, but lead ownership remains seller-only", () => {
  const operators: TenantOperator[] = [
    { ...base, userId: "seller", name: "Vendedor", isSeller: true },
    { ...base, userId: "support", name: "Atendimento", isSeller: false },
    { ...base, userId: "manager", name: "Gestor", isSeller: false },
  ];

  assert.deepEqual(filterLeadOwners(operators).map((operator) => operator.userId), ["seller"]);
});

test("inbox filters can be collapsed and persist per tenant", () => {
  const page = readFileSync(resolve(process.cwd(), "app/cliente/painel/inbox/page.tsx"), "utf8");
  assert.match(page, /Recolher filtros/);
  assert.match(page, /altum:inbox-filters:\$\{tenant\.tenantId\}/);
  assert.match(page, /window\.localStorage\.setItem/);
  assert.match(page, /expanded: showAdvancedFilters/);
});
