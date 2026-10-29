import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/tenant/[tenantId]/ai-proactive/route.ts", import.meta.url), "utf8");
const store = await readFile(new URL("../lib/server/ai/proactive-store.ts", import.meta.url), "utf8");
const reviewRoute = await readFile(new URL("../app/api/tenant/[tenantId]/ai-proactive/[recommendationId]/route.ts", import.meta.url), "utf8");
const jobRoute = await readFile(new URL("../app/api/internal/jobs/ai-proactive/route.ts", import.meta.url), "utf8");
const processor = await readFile(new URL("../lib/server/ai/proactive-processor.ts", import.meta.url), "utf8");
const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
const runner = await readFile(new URL("../infra/jobs/run-job.sh", import.meta.url), "utf8");
const clientHome = await readFile(new URL("../app/cliente/painel/page.tsx", import.meta.url), "utf8");

test("inteligencia proativa exige tenant, modulo, permissao e acesso ao lead", () => {
  assert.match(route, /requireRequestUser/);
  assert.match(route, /assertTenantAccess/);
  assert.match(route, /assertTenantModule\(tenantId, "ai"\)/);
  assert.match(route, /assertTenantCapability\(membership, "edit_leads"\)/);
  assert.match(route, /assertLeadCommercialAccess/);
  assert.match(route, /canAccessAssignedCommercialRecord/);
});

test("aceite, descarte e resultado exigem revisao humana e acesso ao mesmo lead", () => {
  assert.match(reviewRoute, /\["accept", "dismiss", "complete"\]/);
  assert.match(reviewRoute, /\["positive", "negative", "neutral"\]/);
  assert.match(reviewRoute, /assertLeadCommercialAccess/);
  assert.match(reviewRoute, /reviewedBy: user\.uid/);
  assert.match(reviewRoute, /reviewAiProactiveRecommendation/);
  assert.doesNotMatch(reviewRoute, /outcomeNote|body\.note/);
  assert.match(store, /resolveAiProactiveTransition/);
  assert.doesNotMatch(reviewRoute, /sendMessage|dispatchChatMessage|executeAction/);
});

test("motor usa somente fatos operacionais e nao envia mensagem ou executa integracao", () => {
  assert.match(route, /evaluateAndPersistLeadProactivity/);
  assert.match(processor, /generateAiProactiveRecommendation/);
  assert.doesNotMatch(route, /sendMessage|dispatchChatMessage|sendWhatsApp|executeAction/);
  assert.doesNotMatch(store, /messageText|responseText|conversationText/);
});

test("persistencia e transacional, idempotente e escopada por tenant e lead", () => {
  assert.match(store, /runTransaction/);
  assert.match(store, /data\?\.tenantId !== input\.tenantId/);
  assert.match(store, /data\?\.leadId !== input\.leadId/);
  assert.match(store, /transaction\.create/);
});

test("varredura proativa e agendada, autenticada, paginada e sem efeitos externos", () => {
  assert.match(jobRoute, /AI_PROACTIVE_JOBS_TOKEN \|\| process\.env\.CRON_SECRET/);
  assert.match(jobRoute, /timingSafeEqual/);
  assert.match(jobRoute, /scanAiProactiveRecommendations/);
  assert.match(processor, /ai_proactive_scan_cursors/);
  assert.match(processor, /assertTenantModule\(tenantId, "ai"\)/);
  assert.match(processor, /startAfter/);
  assert.match(processor, /externalEffects: 0/);
  assert.match(vercel, /\/api\/internal\/jobs\/ai-proactive/);
  assert.match(runner, /ai-proactive\)/);
});

test("prioridades proativas chegam ao inicio da area do cliente em linguagem comercial", () => {
  assert.match(clientHome, /\/ai-proactive/);
  assert.match(clientHome, /Assumir conversa de/);
  assert.match(clientHome, /Revisar proposta de/);
  assert.match(clientHome, /Retomar oportunidade com/);
  assert.doesNotMatch(clientHome, /runtime.*provider.*queue/i);
});
