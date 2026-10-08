import test from "node:test";
import assert from "node:assert/strict";
import { isExplicitApprovalMessage } from "../lib/server/agent-os/conversation-approval.ts";

test("aprovação no chat exige uma frase afirmativa inequívoca", () => {
  assert.equal(isExplicitApprovalMessage("pode gerar esse vídeo"), true);
  assert.equal(isExplicitApprovalMessage("confirmo, pode seguir"), true);
  assert.equal(isExplicitApprovalMessage("não aprove nem gere"), false);
  assert.equal(isExplicitApprovalMessage("quanto custa gerar o vídeo?"), false);
});
