import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("receipt repair uses existing queue endpoint with management and team scope", async () => {
  const route = await readFile(new URL("../app/api/tenant/[tenantId]/chats/outbound-queue/route.ts", import.meta.url), "utf8");
  assert.match(route, /requireRequestUser/);
  assert.match(route, /assertTenantAccess/);
  assert.match(route, /assertTenantModule\(tenantId, "inbox"\)/);
  const branch = route.slice(route.indexOf('if (body.action === "reconcile_delivery")'), route.indexOf('if (body.action &&'));
  assert.match(branch, /assertTenantCapability\(membership, "manage_channels"\)/);
  assert.match(branch, /assertTenantCapability\(membership, "view_team_records"\)/);
  assert.match(branch, /reconcileTenantWhatsAppDeliveryReceipts/);
  assert.doesNotMatch(branch, /processChatOutboundJobs|after\(/);
  const service = await readFile(new URL("../lib/server/whatsapp-delivery-reconciliation.ts", import.meta.url), "utf8");
  assert.doesNotMatch(service, /from ["'][^"']*(?:chat-outbound|chat-dispatch|messaging\/registry)["']/);
  assert.match(service, /forceHistory: true/);
  assert.match(service, /audit_logs/);
});
