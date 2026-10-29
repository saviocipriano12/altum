import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { commercialObservationReceiptIdentity } from "../lib/server/crm/observation-receipt-identity.ts";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("entrada, resposta humana e resposta da IA usam a fila comercial duravel", async () => {
  const [aiQueue, dispatch, agent] = await Promise.all([
    source("lib/server/ai/queue.ts"),
    source("lib/server/chat-dispatch.ts"),
    source("lib/server/ai/agent.ts"),
  ]);
  assert.match(aiQueue, /enqueueConversationCommercialObservation/);
  assert.match(aiQueue, /source:\s*"inbound_message"/);
  const parsed = ts.createSourceFile("chat-dispatch.ts", dispatch, ts.ScriptTarget.Latest, true);
  const bindings: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && node.expression.getText(parsed) === "enqueueConversationCommercialObservation") {
      const argument = node.arguments[0];
      if (argument && ts.isObjectLiteralExpression(argument)) {
        const property = argument.properties.filter(ts.isPropertyAssignment).find(item => item.name.getText(parsed) === "source");
        bindings.push(property?.initializer.getText(parsed) || "missing");
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  assert.deepEqual(bindings, ['input.automationGenerated ? "automation_outbound" : input.aiGenerated ? "ai_outbound" : "human_outbound"'],
    "Human authorship is only the fallback: AI/automation must not be learned as human examples");
  assert.match(agent, /source:\s*"ai_outbound"/);
});

test("worker principal drena observacoes e publica saude operacional", async () => {
  const worker = await source("app/api/internal/jobs/ai/process/route.ts");
  assert.match(worker, /processConversationCommercialObservationJobs/);
  assert.match(worker, /getConversationCommercialObservationHealth/);
  assert.match(worker, /crmObservations/);
});

test("recibo e evento do CRM possuem identidade deterministica", async () => {
  const input = { tenantId: "a", chatId: "chat", leadId: "lead", messageId: "b_c", messageGeneration: "1:1",
    chatGeneration: "2:1", leadGeneration: "3:1", contactId: null, contactGeneration: "", sourceRevision: "4:1" };
  const first = commercialObservationReceiptIdentity(input);
  assert.deepEqual(commercialObservationReceiptIdentity(input), first);
  assert.notEqual(commercialObservationReceiptIdentity({ ...input, tenantId: "a_b", messageId: "c" }).receiptId, first.receiptId);
  for (const field of ["messageGeneration", "leadGeneration", "chatGeneration"] as const)
    assert.notEqual(commercialObservationReceiptIdentity({ ...input, [field]: "5:1" }).receiptId, first.receiptId);
  const edit = commercialObservationReceiptIdentity({ ...input, sourceRevision: "4:2" });
  assert.equal(edit.receiptId, first.receiptId); assert.notEqual(edit.eventId, first.eventId);
});

test("fila tem lease, tentativas limitadas, dead letter e reconciliacao", async () => {
  const queue = await source("lib/server/crm/conversation-observation-queue.ts");
  assert.match(queue, /LEASE_MS/);
  assert.match(queue, /MAX_ATTEMPTS/);
  assert.match(queue, /dead_letter/);
  assert.match(queue, /reconcileTenantConversationCommercialObservations/);
  assert.match(queue, /crm_observation_reprocessed/);
});
