import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeAiConversationRollout } from "../lib/ai-conversation-rollout.ts";
import { isExplicitAiTestConversation, exclusiveTestNeedsHumanFallback } from "../lib/ai-exclusive-test-safety.ts";

const rollout = normalizeAiConversationRollout({ exclusiveTest: { tenantId: "lf", chatIds: ["whatsapp_lf_7782"] } });
const scope = { rollout, tenantId: "lf", chatId: "whatsapp_lf_7782" };

test("only an explicit exact tenant/chat test grants catalog access without the old timer", () => {
  assert.equal(isExplicitAiTestConversation(scope), true);
  for (const input of [
    { ...scope, chatId: "whatsapp_lf_3050" }, { ...scope, chatId: "7782" },
    { ...scope, tenantId: "another" }, { ...scope, chatId: undefined },
    { ...scope, rollout: normalizeAiConversationRollout({}) },
    { ...scope, rollout: normalizeAiConversationRollout({ exclusiveTest: null }) },
    { ...scope, rollout: normalizeAiConversationRollout({ exclusiveTest: { tenantId: "lf", chatIds: [] } }) },
  ]) assert.equal(isExplicitAiTestConversation(input), false);
});

test("a clear shirt request never becomes a generic probe or copied KB when no engine answered", () => {
  const input = { ...scope, inboundText: "Quero uma camisa do Flamengo tamanho G", hasModelResponse: false, hasCatalogResponse: false };
  assert.equal(exclusiveTestNeedsHumanFallback(input), true);
  for (const inboundText of ["Tem camisa do Flamengo G?", "uma casa muda do Flamengo", "Pode explicar melhor?", "pode mandar a foto?"]) {
    assert.equal(exclusiveTestNeedsHumanFallback({ ...input, inboundText }), true);
  }
  assert.equal(exclusiveTestNeedsHumanFallback({ ...input, hasCatalogResponse: true }), false);
  assert.equal(exclusiveTestNeedsHumanFallback({ ...input, hasModelResponse: true }), false);
  assert.equal(exclusiveTestNeedsHumanFallback({ ...input, inboundText: "Oi" }), false);
  assert.equal(exclusiveTestNeedsHumanFallback({ ...input, inboundText: "Tudo bem" }), false);
  assert.equal(exclusiveTestNeedsHumanFallback({ ...input, rollout: normalizeAiConversationRollout({}) }), false);
});

test("both runtime catalog passes receive trusted rollout; grants do not bypass store, tools or module", () => {
  const agent = readFileSync(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");
  const catalog = readFileSync(new URL("../lib/server/commerce/conversation-catalog.ts", import.meta.url), "utf8");
  assert.equal(agent.match(/context: chatData.commerceConversationContext, rollout: aiConfig.rollout/g)?.length, 2);
  assert.match(catalog, /allowedTools.includes\("knowledge_read"\)/);
  assert.match(catalog, /isProtectedCommerceTurn\(input.inboundText\)/);
  assert.match(catalog, /data.status === "active" && stores.includes/);
  assert.match(catalog, /assertTenantModule\(input.tenantId, "commerce"\)/);
  assert.match(catalog, /&& !exclusiveTest\s*&& !connections.every/);
  assert.ok(agent.indexOf('reason: "exclusive_test_no_verified_response"') < agent.indexOf("fallbackWriterText: makeLeadFacingReply"));
});
