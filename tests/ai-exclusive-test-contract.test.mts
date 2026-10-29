import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("runtime restricts before state restore and multimodal/model/CRM actions", () => {
  const source = readFileSync("lib/server/ai/agent.ts", "utf8");
  const runtime = source.slice(source.indexOf("export async function handleIncomingMessage("));
  const scope = runtime.indexOf("if (!isAiConversationInTestScope(");
  assert.ok(scope > 0);
  for (const effect of ["await getChatState(", "await enrichInboundMessageForAgent(", "await createAiInternalNotificationOnce("]) {
    assert.ok(runtime.indexOf(effect) > scope, effect);
  }
  const latest = source.slice(source.indexOf("async function isLatestCoordinatedConversationTurn("), source.indexOf("function resolveFollowUpTemplateParams("));
  assert.match(latest, /await getTenantSettings/);
  assert.match(latest, /if \(!settings\) return false/);
  assert.match(runtime, /if \(!tenantSettings\) return \{ decision: "skip", reason: "tenant_ai_settings_unavailable" \}/);
  assert.match(latest, /!config.enabled \|\| config.responsePaused \|\| !isAiConversationInTestScope/);
});

test("settings API enforces permission, ownership and preserves test restriction on unrelated edits", () => {
  const source = readFileSync("app/api/tenant/[tenantId]/settings/ai/route.ts", "utf8");
  assert.match(source, /assertTenantCapability\(membership, "manage_ai"\)/);
  assert.match(source, /body.testOnly \?\? current.testOnly/);
  assert.match(source, /chat.data\(\)\?\.tenantId !== tenantId/);
  assert.match(source, /exclusiveTest: requestedRollout.exclusiveTest \?\? FieldValue.delete\(\)/);
});

test("a paused response channel is visible and editable without removing exclusive test", () => {
  const source = readFileSync("app/cliente/painel/ia/page.tsx", "utf8");
  assert.match(source, /responsePaused\?: boolean/);
  assert.match(source, /checked=\{settings.responsePaused === true\}/);
  assert.match(source, /Pausar envio de respostas da IA/);
  assert.match(source, /Teste restrito ativo/);
  assert.match(source, /settings.enabled && !settings.responsePaused/);
});
