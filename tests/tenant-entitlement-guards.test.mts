import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const GUARDED_ROUTES = [
  ["app/api/tenant/[tenantId]/leads/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/leads/[leadId]/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/leads/import/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/pipeline/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/chats/[chatId]/send/route.ts", 'assertTenantModule(tenantId, "inbox")'],
  ["app/api/tenant/[tenantId]/chats/route.ts", 'assertTenantModule(tenantId, "inbox")'],
  ["app/api/tenant/[tenantId]/chats/[chatId]/route.ts", 'assertTenantModule(tenantId, "inbox")'],
  ["app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts", 'assertTenantModule(tenantId, "inbox")'],
  ["app/api/tenant/[tenantId]/leads/[leadId]/stage/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/leads/[leadId]/tasks/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/appointments/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/budgets/route.ts", 'assertTenantModule(tenantId, "crm")'],
  ["app/api/tenant/[tenantId]/automations/route.ts", 'assertTenantModule(tenantId, "automation")'],
  ["app/api/tenant/[tenantId]/follow-ups/route.ts", 'assertTenantModule(tenantId, "automation")'],
  ["app/api/tenant/[tenantId]/capture/forms/route.ts", 'assertTenantModule(tenantId, "marketing")'],
  ["app/api/tenant/[tenantId]/kb-docs/[docId]/route.ts", 'assertTenantModule(tenantId, "ai")'],
  ["app/api/tenant/[tenantId]/channels/[channelId]/whatsapp-session/route.ts", 'assertTenantModule(tenantId, "whatsapp")'],
  ["app/api/tenant/[tenantId]/social-automations/route.ts", 'assertTenantModule(tenantId, "social_automation")'],
  ["app/api/tenant/[tenantId]/assisted-meetings/route.ts", 'assertTenantModule(tenantId, "assisted_meetings")'],
  ["app/api/tenant/[tenantId]/assisted-meetings/live-coach/route.ts", 'assertTenantModule(tenantId, "assisted_meetings")'],
  ["app/api/tenant/[tenantId]/calls/start/route.ts", 'assertTenantModule(tenantId, "calls")'],
  ["app/api/tenant/[tenantId]/whatsapp/send/route.ts", 'assertTenantModule(tenantId, "whatsapp")'],
  ["app/api/tenant/[tenantId]/channels/whatsapp/route.ts", 'assertTenantModule(tenantId, "whatsapp")'],
  ["app/api/tenant/[tenantId]/settings/ai/route.ts", 'assertTenantModule(tenantId, "ai")'],
  ["app/api/tenant/[tenantId]/outbound-campaigns/route.ts", 'assertTenantModule(tenantId, "marketing")'],
  ["app/api/tenant/[tenantId]/ecommerce/connections/route.ts", 'assertTenantModule(tenantId, "commerce")'],
  ["app/api/tenant/[tenantId]/ecommerce/connections/[connectionId]/route.ts", 'assertTenantModule(tenantId, "commerce")'],
  ["app/api/tenant/[tenantId]/ecommerce/connections/[connectionId]/sync/route.ts", 'assertTenantModule(tenantId, "commerce")'],
  ["app/api/tenant/[tenantId]/ecommerce/automation/route.ts", 'assertTenantModule(tenantId, "commerce")'],
  ["app/api/tenant/[tenantId]/ecommerce/actions/process/route.ts", 'assertTenantModule(tenantId, "commerce")'],
  ["app/api/tenant/[tenantId]/ecommerce/actions/[actionId]/route.ts", 'assertTenantModule(tenantId, "commerce")'],
  ["app/api/tenant/[tenantId]/ecommerce/actions/[actionId]/send-template/route.ts", 'assertTenantModule(tenantId, "commerce")'],
  ["app/api/webhooks/ecommerce/[provider]/route.ts", 'assertTenantModule(tenantId, "commerce")'],
] as const;

const LIMIT_GUARDED_ROUTES = [
  ["app/api/tenant/[tenantId]/leads/route.ts", 'limitId: "contacts"'],
  ["app/api/tenant/[tenantId]/leads/import/route.ts", 'limitId: "contacts"'],
  ["app/api/tenant/[tenantId]/users/route.ts", 'limitId: "users"'],
  ["app/api/admin/tenants/[tenantId]/users/invite/route.ts", 'limitId: "users"'],
  ["app/api/tenant/[tenantId]/channels/route.ts", 'limitId: "whatsappChannels"'],
  ["app/api/tenant/[tenantId]/channels/whatsapp/route.ts", 'limitId: "whatsappChannels"'],
  ["app/api/admin/tenants/[tenantId]/channels/whatsapp/route.ts", 'limitId: "whatsappChannels"'],
] as const;

test("critical commercial APIs enforce tenant modules on the server", () => {
  for (const [route, expectedGuard] of GUARDED_ROUTES) {
    const source = readFileSync(resolve(process.cwd(), route), "utf8");
    assert.equal(
      source.includes(expectedGuard),
      true,
      `${route} must include ${expectedGuard}`
    );
  }
});

test("contracted user, contact and WhatsApp limits are enforced on writes", () => {
  for (const [route, expectedGuard] of LIMIT_GUARDED_ROUTES) {
    const source = readFileSync(resolve(process.cwd(), route), "utf8");
    assert.equal(source.includes("assertTenantLimitAvailable"), true, `${route} must enforce a tenant limit`);
    assert.equal(source.includes(expectedGuard), true, `${route} must include ${expectedGuard}`);
  }
});

test("AI runtime uses the contracted monthly execution ceiling", () => {
  const source = readFileSync(resolve(process.cwd(), "lib/server/ai/agent.ts"), "utf8");
  assert.equal(source.includes("tenantEntitlements.limits.aiRunsPerMonth"), true);
  assert.equal(source.includes("effectiveUsageCap"), true);
});

test("automation runtime reserves monthly contracted usage atomically", () => {
  const runtime = readFileSync(resolve(process.cwd(), "lib/server/automations.ts"), "utf8");
  const usage = readFileSync(resolve(process.cwd(), "lib/server/tenant-usage.ts"), "utf8");
  assert.equal(runtime.includes("reserveTenantAutomationExecution"), true);
  assert.equal(usage.includes("automationsPerMonth"), true);
  assert.equal(usage.includes("runTransaction"), true);
});

test("owner panel compares contracted limits with real tenant usage", () => {
  const api = readFileSync(
    resolve(process.cwd(), "app/api/admin/tenants/[tenantId]/entitlements/route.ts"),
    "utf8"
  );
  const card = readFileSync(
    resolve(process.cwd(), "app/admin/clientes/[id]/portal/tenant-entitlements-card.tsx"),
    "utf8"
  );
  assert.equal(api.includes("getTenantCommercialUsage"), true);
  assert.equal(api.includes("entitlements, usage"), true);
  assert.equal(card.includes("Uso operacional de"), true);
  assert.equal(card.includes("used / contracted"), true);
  assert.equal(card.includes("Margem conhecida"), true);
  assert.equal(card.includes("aiEstimatedCostUsd"), true);
});

test("contract stores external provider costs with before and after audit", () => {
  const contract = readFileSync(
    resolve(process.cwd(), "app/api/admin/client-portal/contracts/upsert/route.ts"),
    "utf8"
  );
  assert.equal(contract.includes("whatsappCostMonthlyBrl"), true);
  assert.equal(contract.includes("telephonyCostMonthlyBrl"), true);
  assert.equal(contract.includes("otherVariableCostMonthlyBrl"), true);
  assert.equal(contract.includes("before:"), true);
  assert.equal(contract.includes("after:"), true);
});

test("commercial plan, price and contracted capabilities stay connected", () => {
  const contract = readFileSync(
    resolve(process.cwd(), "app/api/admin/client-portal/contracts/upsert/route.ts"),
    "utf8"
  );
  const createTenant = readFileSync(
    resolve(process.cwd(), "app/api/admin/tenants/create/route.ts"),
    "utf8"
  );
  const portal = readFileSync(
    resolve(process.cwd(), "app/admin/clientes/[id]/portal/page.tsx"),
    "utf8"
  );

  assert.equal(contract.includes("customPlanName"), true);
  assert.equal(contract.includes("applyPlanEntitlements"), true);
  assert.equal(contract.includes("getPlatformPlanEntitlements(platformPlan)"), true);
  assert.equal(createTenant.includes("getPlatformPlanEntitlements(platformPlan)"), true);
  assert.equal(portal.includes("Mensalidade personalizada (R$)"), true);
  assert.equal(portal.includes("Aplicar conteúdo do plano-base a este cliente"), true);
});

test("an admin offer takes precedence over trial access in the client panel", () => {
  const trial = readFileSync(
    resolve(process.cwd(), "lib/server/platform-plan-entitlements.ts"),
    "utf8"
  );
  const adminEntitlements = readFileSync(
    resolve(process.cwd(), "app/api/admin/tenants/[tenantId]/entitlements/route.ts"),
    "utf8"
  );
  const clientMe = readFileSync(resolve(process.cwd(), "app/api/client-portal/me/route.ts"), "utf8");
  const bottomNav = readFileSync(
    resolve(process.cwd(), "app/cliente/painel/components/cliente-bottom-nav.tsx"),
    "utf8"
  );

  assert.equal(trial.includes("isAdminManagedAccess(input.currentEntitlements)"), true);
  assert.equal(adminEntitlements.includes('entitlementSource: "admin_custom"'), true);
  assert.equal(clientMe.includes("entitlements: portalUser.entitlements"), true);
  assert.equal(clientMe.includes("ensureActiveTrialFullAccess"), false);
  assert.equal(bottomNav.includes("hasModule(item.module)"), true);
});

test("opening the client panel is read-only for the commercial offer", () => {
  const trial = readFileSync(
    resolve(process.cwd(), "lib/server/platform-plan-entitlements.ts"),
    "utf8"
  );
  assert.equal(trial.includes("!input.currentEntitlements.isLegacyFallback"), true);
  assert.equal(trial.includes("Uma leitura de sessão nunca deve reabrir módulos"), true);
});

test("Altum administrators can open a specific customer tenant without an individual membership", () => {
  const portalAuth = readFileSync(resolve(process.cwd(), "app/lib/server/portal-auth.ts"), "utf8");
  const dashboard = readFileSync(resolve(process.cwd(), "app/api/client-portal/dashboard/route.ts"), "utf8");
  const overview = readFileSync(resolve(process.cwd(), "app/cliente/painel/page.tsx"), "utf8");
  assert.equal(portalAuth.includes("assertTenantAccess(decoded.uid, requestedTenantId)"), true);
  assert.equal(portalAuth.includes("administradores globais da agência"), true);
  assert.equal(dashboard.includes('requirePortalRequestUser(req, { tenantId: requestedTenantId })'), true);
  assert.equal(overview.includes('/api/client-portal/dashboard?tenantId=${encodeURIComponent(tenantId)}'), true);
});

test("company management uses Asaas for custom subscriptions and trial extensions", () => {
  const companyPage = readFileSync(resolve(process.cwd(), "app/admin/clientes/[id]/portal/page.tsx"), "utf8");
  const asaas = readFileSync(resolve(process.cwd(), "app/api/admin/client-portal/contracts/asaas/route.ts"), "utf8");
  const control = readFileSync(resolve(process.cwd(), "app/api/admin/client-portal/contracts/control/route.ts"), "utf8");

  assert.equal(companyPage.includes("Criar assinatura Asaas"), true);
  assert.equal(companyPage.includes("Estender teste"), true);
  assert.equal(companyPage.includes("Gerar checkout Stripe"), false);
  assert.equal(asaas.includes('"/subscriptions"'), true);
  assert.equal(asaas.includes('action === "update_subscription"'), true);
  assert.equal(asaas.includes('action === "cancel_subscription"'), true);
  assert.equal(asaas.includes("monthlyValue"), true);
  assert.equal(control.includes('action === "extend_trial"'), true);
  assert.equal(control.includes("trialEndsAt"), true);
});

test("media pixels distinguish provider verification from the company event signal", () => {
  const overview = readFileSync(resolve(process.cwd(), "lib/admin-marketing-overview.ts"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "app/admin/midia/page.tsx"), "utf8");
  assert.equal(overview.includes("tenantDeliveryStatus"), true);
  assert.equal(overview.includes('"recent_tenant_event"'), true);
  assert.equal(page.includes("Sinal recente da operação"), true);
  assert.equal(page.includes("não confirma entrega deste pixel específico"), true);
});

test("custom contracts keep their offer after Asaas payment events and expose the open charge", () => {
  const asaasAdmin = readFileSync(resolve(process.cwd(), "app/api/admin/client-portal/contracts/asaas/route.ts"), "utf8");
  const webhook = readFileSync(resolve(process.cwd(), "app/api/webhooks/asaas/route.ts"), "utf8");
  const subscription = readFileSync(resolve(process.cwd(), "app/api/billing/asaas/subscription/route.ts"), "utf8");
  assert.equal(asaasAdmin.includes("syncOpenSubscriptionCharge"), true);
  assert.equal(asaasAdmin.includes("asaas_subscription_"), true);
  assert.equal(webhook.includes("adminManagedEntitlements"), true);
  assert.equal(webhook.includes('event === "PAYMENT_CREATED"'), true);
  assert.equal(subscription.includes("pixQrCode"), true);
});

test("company deletion accepts intentional cleanup after an exact-name confirmation", () => {
  const route = readFileSync(resolve(process.cwd(), "app/api/clientes/delete/route.ts"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "app/admin/clientes/page.tsx"), "utf8");
  const cancellation = readFileSync(resolve(process.cwd(), "lib/server/subscription-cancellation.ts"), "utf8");
  assert.equal(route.includes("Digite o nome exato da empresa"), true);
  assert.equal(route.includes("cancelPlatformSubscription"), true);
  assert.equal(route.includes("company_permanently_deleted"), true);
  assert.equal(route.includes('roles: ["agency_admin"]'), true);
  assert.equal(route.includes('roles: ["agency_agent"]'), false);
  assert.equal(cancellation.includes("platformAccessStatus: billingStatus"), true);
  assert.equal(page.includes("digite exatamente"), true);
});

test("new knowledge and conversation media respect contracted storage", () => {
  const usage = readFileSync(resolve(process.cwd(), "lib/server/tenant-usage.ts"), "utf8");
  const dispatch = readFileSync(resolve(process.cwd(), "lib/server/chat-dispatch.ts"), "utf8");
  const knowledgeUpload = readFileSync(
    resolve(process.cwd(), "app/api/tenant/[tenantId]/kb-docs/media/upload/route.ts"),
    "utf8"
  );
  assert.equal(usage.includes("assertTenantStorageAvailable"), true);
  assert.equal(usage.includes("limits.storageMb"), true);
  assert.equal(dispatch.includes("assertTenantStorageAvailable(tenantId, input.buffer.length)"), true);
  assert.equal(knowledgeUpload.includes("assertTenantStorageAvailable(tenantId, size)"), true);
});

test("CRM supports incremental loading without per-contact timeline queries", () => {
  const api = readFileSync(resolve(process.cwd(), "app/api/tenant/[tenantId]/leads/route.ts"), "utf8");
  const page = readFileSync(resolve(process.cwd(), "app/cliente/painel/crm/page.tsx"), "utf8");
  assert.equal(api.includes("leadsQuery.offset(pageOffset).limit(pageLimit)"), true);
  assert.equal(api.includes("leadsQuery.count().get()"), true);
  assert.equal(api.includes("listChatsForLeadPage(tenantId, leads)"), true);
  assert.equal(api.includes('.where("leadId", "in", ids)'), true);
  assert.equal(api.includes('.where("contactPhone", "in", values)'), true);
  assert.equal(api.includes("limit(1_000)"), false);
  assert.equal(api.includes("timelineByLead"), false);
  assert.equal(page.includes("loadMoreLeads"), true);
  assert.equal(page.includes("const CRM_PAGE_SIZE = 80"), true);
  assert.equal(page.includes("Carregar mais clientes"), true);
});

test("global search hides modules and data outside the tenant contract", () => {
  const search = readFileSync(resolve(process.cwd(), "app/api/tenant/[tenantId]/search/route.ts"), "utf8");
  assert.equal(search.includes("getTenantEntitlements"), true);
  assert.equal(search.includes("!entitlements.modules[item.module]"), true);
  assert.equal(search.includes("entitlements.modules.crm ?"), true);
  assert.equal(search.includes("entitlements.modules.inbox ?"), true);
  assert.equal(search.includes("entitlements.modules.automation ?"), true);
  assert.equal(search.includes("entitlements.modules.commerce ?"), true);
  assert.equal(search.includes('collection("lead_tasks")'), true);
  assert.equal(search.includes('collection("ecommerce_orders")'), true);
});

test("global commercial search exposes customer, conversation, proposal, task and order results", () => {
  const component = readFileSync(resolve(process.cwd(), "app/cliente/painel/components/cliente-global-search.tsx"), "utf8");
  assert.equal(component.includes("event.metaKey || event.ctrlKey"), true);
  assert.equal(component.includes('<SearchSection title="Tarefas">'), true);
  assert.equal(component.includes('<SearchSection title="Pedidos">'), true);
  assert.equal(component.includes("&taskId=${encodeURIComponent(item.id)}"), true);
  assert.equal(component.includes("controller.abort()"), true);
});
