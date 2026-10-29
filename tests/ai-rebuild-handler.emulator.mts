import test from "node:test";
import assert from "node:assert/strict";
import { collectHandlerBaseline } from "../scripts/ai-rebuild/handler-baseline.mts";

// A dedicated process/project; no real provider pass-through is possible.
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
test("real handler keeps synthetic multi-turn history, blocks mismatched sources before model and observes paused CRM", async () => {
  const report = await collectHandlerBaseline();
  assert.equal(report.sourceUnchanged, true);
  assert.equal(report.paidModelCalls, 0); assert.equal(report.externalEffectsExecuted, false);
  assert.deepEqual(report.blockedNetwork, []);
  assert.equal(report.turns.length, 4);
  for (const turn of report.turns) {
    assert.equal(turn.result.decision, "respond"); assert.equal(turn.modelRequests.length, 1);
    assert.equal(turn.delivered.length, 1); assert.equal(turn.delivered[0].recipient, "5511000000088");
    assert.equal(turn.delivered[0].text, turn.modelResponse);
  }
  const lastPrompt = JSON.stringify(report.turns.at(-1)!.modelRequests[0].messages);
  assert.ok(lastPrompt.includes("Na verdade eu quero GG, nao G"));
  assert.ok(lastPrompt.includes("Minha cidade e Campinas"));
  assert.equal(report.foreignSourceProbe.foreignSourceReachedModel, false);
  assert.equal(report.foreignSourceProbe.modelRequests, 0);
  assert.equal(report.foreignSourceProbe.result.reason, "message_tenant_mismatch");
  assert.equal(report.wrongChatProbe.wrongChatReachedModel, false);
  assert.equal(report.wrongChatProbe.result.reason, "message_chat_mismatch");
  assert.equal(report.missingLinkProbe.result.reason, "message_chat_mismatch");
  assert.equal(report.missingLinkProbe.modelRequests, 0);
  assert.equal(report.replayProbe.result.reason, "already_processed");
  assert.equal(report.replayProbe.extraDeliveries, 0); assert.equal(report.replayProbe.extraModelRequests, 0);
  assert.equal(report.outbound.length, 4); assert.ok(report.outbound.every(job => job.status === "completed"));
  assert.equal(report.passiveProbe.city, "Recife"); assert.equal(report.passiveProbe.deliveryWhilePaused, 0);
  assert.equal(report.passiveProbe.result.decision, "skip");
  assert.equal(report.acceptance.productReady, false); assert.equal(report.acceptance.realModelQualityTested, false);
});
