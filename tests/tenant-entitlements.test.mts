import test from "node:test";
import assert from "node:assert/strict";
import {
  allTenantModules,
  buildLegacyTenantEntitlements,
  normalizeTenantEntitlements,
  normalizeTenantModules,
  getTenantModuleForClientPath,
} from "../lib/tenant-entitlements.ts";

test("legacy tenants keep every module enabled until explicitly configured", () => {
  const snapshot = buildLegacyTenantEntitlements("tenant_legacy");
  assert.equal(snapshot.mode, "legacy_full_access");
  assert.equal(snapshot.isLegacyFallback, true);
  assert.equal(Object.values(snapshot.modules).every(Boolean), true);
});

test("client routes resolve to the commercial module that owns the experience", () => {
  assert.equal(getTenantModuleForClientPath("/cliente/painel/inbox"), "inbox");
  assert.equal(getTenantModuleForClientPath("/cliente/painel/pipeline"), "crm");
  assert.equal(getTenantModuleForClientPath("/cliente/painel/ia/avancado"), "ai");
  assert.equal(getTenantModuleForClientPath("/cliente/painel/configuracoes"), null);
});

test("module dependencies are enabled with the contracted module", () => {
  const modules = normalizeTenantModules({ ...allTenantModules(false), whatsapp: true }, allTenantModules(false));
  assert.equal(modules.whatsapp, true);
  assert.equal(modules.inbox, true);
  assert.equal(modules.crm, false);
});

test("new sellable add-ons preserve access from older custom contracts", () => {
  const snapshot = normalizeTenantEntitlements("tenant_existing", {
    mode: "custom",
    modules: { crm: true, ai: true, automation: true, instagram: true },
  });
  assert.equal(snapshot.modules.calls, true);
  assert.equal(snapshot.modules.assisted_meetings, true);
  assert.equal(snapshot.modules.social_automation, true);
});

test("custom entitlements preserve zero limits and normalize invalid values", () => {
  const snapshot = normalizeTenantEntitlements("tenant_custom", {
    mode: "custom",
    modules: { crm: true, inbox: true },
    limits: { users: 8, aiRunsPerMonth: 0, contacts: -1 },
  });
  assert.equal(snapshot.mode, "custom");
  assert.equal(snapshot.modules.crm, true);
  assert.equal(snapshot.modules.ai, false);
  assert.equal(snapshot.limits.users, 8);
  assert.equal(snapshot.limits.aiRunsPerMonth, 0);
  assert.equal(snapshot.limits.contacts, 10_000);
});
