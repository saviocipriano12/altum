import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("tenant settings accepts partial saves without blanking company data", async () => {
  const route = await source("app/api/tenant/[tenantId]/settings/route.ts");
  assert.match(route, /hasOwn\(rawBody, "businessProfileId"\)/);
  assert.match(route, /copyStringField\("name", 180\)/);
  assert.doesNotMatch(route, /name:\s*clean\(body\.name/);
  assert.doesNotMatch(route, /responsibleEmail:\s*clean\(body\.responsibleEmail/);
});

test("client user updates stay tenant-scoped and keep at least one admin", async () => {
  const route = await source("app/api/tenant/[tenantId]/users/[userId]/route.ts");
  assert.match(route, /Nao e permitido alterar o proprio acesso critico/);
  assert.match(route, /A conta precisa manter ao menos um admin ativo/);
  assert.match(route, /assertTenantLimitAvailable/);
  assert.match(route, /defaultCapabilitiesForRole/);
  assert.doesNotMatch(route, /collection\("users"\)\.doc\(userId\)\.set\(patch/);
  assert.doesNotMatch(route, /collection\("client_portal_users"\)\.doc\(userId\)\.set\(patch/);
});

test("client invitations do not reset existing accounts and report email delivery", async () => {
  const route = await source("app/api/tenant/[tenantId]/users/route.ts");
  assert.match(route, /createdAuthUser/);
  assert.match(route, /usuario_existente_sem_reset/);
  assert.match(route, /sendPasswordResetEmail/);
  assert.match(route, /emailDelivery/);
});

test("inbound routing honors configured teams and writes nested inbox rules", async () => {
  const routing = await source("lib/server/tenant-routing.ts");
  const chatDistribution = await source("app/api/tenant/[tenantId]/chats/distribute/route.ts");
  const leadDistribution = await source("app/api/tenant/[tenantId]/leads/distribute/route.ts");
  assert.match(routing, /defaultTeam/);
  assert.match(routing, /teamMatched/);
  assert.match(routing, /businessHoursOnly/);
  assert.match(routing, /rules:\s*\{\s*inbox:/s);
  assert.doesNotMatch(routing, /"rules\.inbox\.lastAssignedUserId"/);
  assert.doesNotMatch(chatDistribution, /"rules\.inbox\.lastAssignedUserId"/);
  assert.doesNotMatch(leadDistribution, /"rules\.inbox\.lastAssignedUserId"/);
});

test("client MCP settings are discoverable but keep real writes behind approval policy", async () => {
  const page = await source("app/cliente/painel/configuracoes/mcp/page.tsx");
  const statusRoute = await source("app/api/tenant/[tenantId]/mcp/status/route.ts");
  const revokeRoute = await source("app/api/tenant/[tenantId]/mcp/connections/[connectionId]/route.ts");
  const draftsRoute = await source("app/api/tenant/[tenantId]/mcp/drafts/route.ts");
  const draftReviewRoute = await source("app/api/tenant/[tenantId]/mcp/drafts/[draftId]/route.ts");
  const draftApplyRoute = await source("app/api/tenant/[tenantId]/mcp/drafts/[draftId]/apply/route.ts");
  const settingsPage = await source("app/cliente/painel/configuracoes/page.tsx");
  const sidebar = await source("app/cliente/painel/components/cliente-sidebar.tsx");

  assert.match(page, /\/api\/tenant\/\$\{tenant\.tenantId\}\/mcp\/status/);
  assert.match(page, /approval_required/);
  assert.match(page, /ChatGPT web/);
  assert.match(page, /Servidor remoto universal/);
  assert.match(page, /Conexoes autorizadas/);
  assert.match(page, /Rascunhos para aprovacao/);
  assert.match(page, /applyDraft/);
  assert.match(statusRoute, /assertTenantCapability\(membership, "manage_settings"\)/);
  assert.match(statusRoute, /MCP_CONTEXT_SECRET/);
  assert.match(statusRoute, /ready_for_oauth_clients/);
  assert.match(statusRoute, /MCP_REMOTE_PATH/);
  assert.match(statusRoute, /listMcpConnections/);
  assert.match(revokeRoute, /revokeMcpConnection/);
  assert.match(revokeRoute, /assertTenantCapability\(membership, "manage_settings"\)/);
  assert.match(draftsRoute, /mcp_action_drafts/);
  assert.match(draftReviewRoute, /approved_pending_apply/);
  assert.match(draftApplyRoute, /tenant_settings/);
  assert.match(draftApplyRoute, /assertTenantCapability\(membership, "manage_ai"\)/);
  assert.match(draftApplyRoute, /mcp_action_draft_applied/);
  assert.doesNotMatch(statusRoute, /contextSecret:\s*process\.env\.MCP_CONTEXT_SECRET/);
  assert.match(settingsPage, /\/cliente\/painel\/configuracoes\/mcp/);
  assert.match(sidebar, /\/cliente\/painel\/configuracoes\/mcp/);
});
