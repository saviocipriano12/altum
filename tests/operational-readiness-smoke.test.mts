import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), relativePath), "utf8")) as T;
}

function routePathToFile(routePath: string) {
  return join(process.cwd(), "app", routePath.slice(1), "route.ts");
}

test("operational schedulers point to real internal route handlers", () => {
  const vercel = readJson<{ crons?: Array<{ path?: string; schedule?: string }> }>("vercel.json");
  const cronPaths = (vercel.crons || []).map((item) => String(item.path || "").split("?")[0]);
  const vpsScheduler = existsSync(join(process.cwd(), "infra/jobs/run-job.sh"))
    ? readFileSync(join(process.cwd(), "infra/jobs/run-job.sh"), "utf8")
    : "";
  const expected = [
    "/api/internal/jobs/ai/process",
    "/api/internal/jobs/automations/process",
    "/api/internal/jobs/chat-outbound/process",
    "/api/internal/jobs/campaigns/sync",
    "/api/internal/jobs/client-portal/push-critical",
    "/api/internal/jobs/commerce/sync",
    "/api/internal/jobs/finance/contract-billing",
  ];

  assert.deepEqual(
    expected.filter((path) => !cronPaths.includes(path) && !vpsScheduler.includes(path)),
    [],
    "Existem jobs criticos esperados ausentes dos agendadores operacionais."
  );

  assert.deepEqual(
    expected.filter((path) => !existsSync(routePathToFile(path))),
    [],
    "Existem jobs criticos configurados sem route handler."
  );

  const chatTimerPath = join(process.cwd(), "infra/jobs/altum-job-chat.timer");
  const installerPath = join(process.cwd(), "infra/jobs/install.sh");
  assert.equal(existsSync(chatTimerPath), true, "A fila de conversa precisa de timer de recuperacao na VPS.");
  assert.match(readFileSync(chatTimerPath, "utf8"), /Unit=altum-job@chat\.service/);
  assert.match(readFileSync(installerPath, "utf8"), /altum-job-chat\.timer/);
});

test("package.json exposes critical validation and onboarding commands", () => {
  const pkg = readJson<{ scripts?: Record<string, string> }>("package.json");
  const scripts = pkg.scripts || {};

  assert.equal(typeof scripts["test:smoke"], "string");
  assert.equal(typeof scripts["test:agent-closure"], "string");
  assert.equal(typeof scripts["verify:postdeploy"], "string");
  assert.equal(typeof scripts["cliente:onboarding:new"], "string");
});

test("operational docs and scripts referenced by the platform exist", () => {
  const requiredFiles = [
    "docs/CLIENTE_FECHADO_CHECKLIST_OFICIAL.md",
    "docs/CLIENTE_FECHADO_FICHA_OPERACIONAL_TEMPLATE.md",
    "docs/go-live-definitivo-checklist.md",
    "docs/go-live-runbook.md",
    "docs/go-live-incident-playbook.md",
    "docs/POST_DEPLOY_CHECKLIST.md",
    "docs/LGPD_OPERACAO_E_GOVERNANCA.md",
    "docs/INTEGRATIONS_OAUTH_MANAGED.md",
    "docs/AGENT_CLOSURE_MODE.md",
    "scripts/new-client-onboarding.mjs",
    "scripts/post-deploy-verify.mjs",
    "scripts/run-agent-closure-gate.mjs",
  ];

  assert.deepEqual(
    requiredFiles.filter((file) => !existsSync(join(process.cwd(), file))),
    [],
    "Arquivos operacionais obrigatorios estao faltando."
  );
});

test("README documents platform-specific setup and release gates", () => {
  const readme = readFileSync(join(process.cwd(), "README.md"), "utf8");

  assert.match(readme, /ALTUM/);
  assert.match(readme, /test:smoke/);
  assert.match(readme, /test:agent-closure/);
  assert.match(readme, /verify:postdeploy/);
  assert.match(readme, /cliente:onboarding:new/);
  assert.match(readme, /\/cliente\/painel\/go-live/);
  assert.match(readme, /AI_JOBS_PROCESS_TOKEN/);
});

test("product onboarding persists nested state and recognizes commerce connections", () => {
  const route = readFileSync(
    join(process.cwd(), "app/api/tenant/[tenantId]/onboarding/route.ts"),
    "utf8"
  );

  assert.match(route, /onboarding:\s*\{\s*product:\s*\{/);
  assert.doesNotMatch(route, /["'`]onboarding\.product\./);
  assert.match(route, /collection\("ecommerce_connections"\)/);
  assert.match(route, /commerceConnections:/);
});

test("product onboarding builds one organizational memory for CRM and AI", () => {
  const route = readFileSync(
    join(process.cwd(), "app/api/tenant/[tenantId]/onboarding/route.ts"),
    "utf8"
  );
  const page = readFileSync(join(process.cwd(), "app/cliente/painel/onboarding/page.tsx"), "utf8");

  assert.match(route, /businessContext/);
  assert.match(route, /commercialBrain/);
  assert.match(route, /onboarding_\$\{safeTenant\}_politicas/);
  assert.match(route, /onboarding_\$\{safeTenant\}_vendas/);
  assert.match(route, /suggestedTags: profile\.crm\.suggestedTags/);
  assert.match(route, /before:/);
  assert.match(route, /after:/);
  assert.doesNotMatch(route, /Resposta: validar com a equipe comercial/);
  assert.match(page, /Perguntas e respostas frequentes/);
  assert.match(page, /Regras especiais/);
  assert.match(page, /Formas de pagamento/);
});

test("new WhatsApp conversations preserve CRM linkage and Meta template rules", () => {
  const route = readFileSync(
    join(process.cwd(), "app/api/tenant/[tenantId]/whatsapp/send/route.ts"),
    "utf8"
  );
  const chatOperations = readFileSync(join(process.cwd(), "lib/server/chat-operations.ts"), "utf8");

  assert.match(route, /leadId:\s*destination\.leadId/);
  assert.match(route, /provider\.id === "meta_cloud"/);
  assert.match(route, /requiresTemplate:\s*true/);
  assert.match(chatOperations, /requiresTemplate:\s*false/);
});

test("commercial CRM supports manual creation and sends CSV imports in the API contract", () => {
  const page = readFileSync(join(process.cwd(), "app/cliente/painel/crm/page.tsx"), "utf8");
  const route = readFileSync(join(process.cwd(), "app/api/tenant/[tenantId]/leads/route.ts"), "utf8");

  assert.match(page, /Novo cliente/);
  assert.match(page, /method:\s*"POST"/);
  assert.match(page, /JSON\.stringify\(\{ csvContent \}\)/);
  assert.match(route, /export async function POST/);
  assert.match(route, /trigger:\s*"lead_created"/);
});

test("Customer 360 links identities and exposes commerce inside the CRM profile", () => {
  const contactProfile = readFileSync(join(process.cwd(), "lib/server/contact-profile.ts"), "utf8");
  const intake = readFileSync(join(process.cwd(), "lib/server/lead-intake.ts"), "utf8");
  const leadDetail = readFileSync(
    join(process.cwd(), "app/api/tenant/[tenantId]/leads/[leadId]/route.ts"),
    "utf8"
  );
  const crm = readFileSync(join(process.cwd(), "app/cliente/painel/crm/page.tsx"), "utf8");
  assert.equal(contactProfile.includes("canonicalContactId"), true);
  assert.equal(contactProfile.includes("FieldValue.arrayUnion(leadId)"), true);
  assert.equal(intake.includes("upsertContactProfile"), true);
  assert.equal(leadDetail.includes("listEcommerceOrders"), true);
  assert.equal(crm.includes("Compras e receita"), true);
});

test("Customer 360 queries appointments and orders by customer instead of scanning tenant history", () => {
  const detail = readFileSync(join(process.cwd(), "app/api/tenant/[tenantId]/leads/[leadId]/route.ts"), "utf8");
  assert.match(detail, /collection\("appointments"\)[\s\S]*?where\("leadId", "==", leadId\)/);
  assert.match(detail, /collection\("ecommerce_orders"\)[\s\S]*?where\("leadId", "==", leadId\)/);
  assert.doesNotMatch(detail, /collection\("ecommerce_orders"\)\.where\("tenantId", "==", tenantId\)\.limit\(500\)/);
});

test("tenant health validates WhatsApp and commerce and reaches the owner panel", () => {
  const health = readFileSync(join(process.cwd(), "lib/server/integrations/health.ts"), "utf8");
  const readiness = readFileSync(
    join(process.cwd(), "app/api/admin/tenants/[tenantId]/readiness/route.ts"),
    "utf8"
  );
  const ownerPanel = readFileSync(
    join(process.cwd(), "app/admin/clientes/[id]/portal/page.tsx"),
    "utf8"
  );

  assert.match(health, /verifyWhatsAppChannel/);
  assert.match(health, /getWhatsAppMessagingProvider/);
  assert.match(health, /verifyCommerceConnection/);
  assert.match(health, /provider\.testConnection/);
  assert.match(readiness, /integrationHealth/);
  assert.match(ownerPanel, /Saude das integracoes/);
  assert.match(ownerPanel, /saudaveis/);
});

test("daily WhatsApp reports use the shared provider for official and QR channels", () => {
  const report = readFileSync(join(process.cwd(), "lib/server/daily-report.ts"), "utf8");
  assert.match(report, /getWhatsAppMessagingProvider/);
  assert.match(report, /provider\.supportsTemplates/);
  assert.match(report, /provider\.sendTemplate/);
  assert.match(report, /provider\.sendText/);
  assert.doesNotMatch(report, /sendMetaTemplateMessage/);
});

test("scheduled integration health includes WhatsApp-only and commerce-only tenants", () => {
  const job = readFileSync(
    join(process.cwd(), "app/api/internal/jobs/integrations/health/route.ts"),
    "utf8"
  );
  assert.match(job, /searchParams\.get\("maxTenants"\)/);
  assert.match(job, /"whatsapp"/);
  assert.match(job, /collection\("ecommerce_connections"\)/);
});

test("integration health has provider deadlines so one outage cannot stall every tenant", () => {
  const health = readFileSync(join(process.cwd(), "lib/server/integrations/health.ts"), "utf8");
  const evolution = readFileSync(join(process.cwd(), "lib/server/messaging/evolution-provider.ts"), "utf8");
  assert.match(health, /withinHealthDeadline/);
  assert.match(health, /AbortSignal\.timeout\(10_000\)/);
  assert.match(evolution, /AbortSignal\.timeout\(20_000\)/);
});

test("client notification center is tenant-scoped, entitlement-aware and actionable", () => {
  const api = readFileSync(
    join(process.cwd(), "app/api/tenant/[tenantId]/notifications/route.ts"),
    "utf8"
  );
  const component = readFileSync(
    join(process.cwd(), "app/cliente/painel/components/cliente-notifications.tsx"),
    "utf8"
  );
  const topbar = readFileSync(
    join(process.cwd(), "app/cliente/painel/components/cliente-topbar.tsx"),
    "utf8"
  );
  assert.match(api, /assertTenantAccess/);
  assert.match(api, /getTenantEntitlements/);
  assert.match(api, /tenant_notification_state/);
  assert.match(api, /cliente\(s\) esperando além do prazo/);
  assert.match(api, /oportunidade\(s\) quentes/);
  assert.match(component, /Central de notificacoes/);
  assert.match(component, /useAdaptivePolling/);
  assert.match(topbar, /<ClienteNotifications/);
});

test("go-live readiness accepts the canonical health status written by channel checks", () => {
  const readiness = readFileSync(join(process.cwd(), "lib/server/tenant-readiness.ts"), "utf8");
  assert.match(readiness, /function isChannelConnected/);
  assert.match(readiness, /connectionStatus === "ready"/);
  assert.match(readiness, /channels\.filter\(isChannelOperational\)/);
  assert.match(readiness, /filter\(\(item\) => !isChannelOperational\(item\)\)/);
});

test("inbox listing is bounded and does not block normal refreshes on external synchronization", () => {
  const route = readFileSync(join(process.cwd(), "app/api/tenant/[tenantId]/chats/route.ts"), "utf8");
  const page = readFileSync(join(process.cwd(), "app/cliente/painel/inbox/page.tsx"), "utf8");
  assert.match(route, /Math\.max\(25, Math\.min\(200/);
  assert.match(route, /url\.searchParams\.get\("sync"\) === "recent"/);
  assert.match(route, /const \[snap, stateSnap, enrichment\] = await Promise\.all/);
  assert.match(route, /ENRICHMENT_CACHE_TTL_MS = 30_000/);
  assert.match(page, /async \(withMessages = false, syncExternal = false\)/);
  assert.match(page, /loadChats\(\{ silent: true, syncExternal \}\)/);
  assert.match(page, /refreshSelected\(true, true\)/);
});

test("lead distribution scales beyond one Firestore write batch", () => {
  const route = readFileSync(
    join(process.cwd(), "app/api/tenant/[tenantId]/leads/distribute/route.ts"),
    "utf8"
  );
  assert.match(route, /adminDb\.bulkWriter\(\)/);
  assert.match(route, /await writer\.close\(\)/);
  assert.doesNotMatch(route, /await batch\.commit\(\)/);
});
