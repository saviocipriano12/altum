import test from "node:test";
import assert from "node:assert/strict";
import { parseCreativeReviewMessage } from "../lib/server/agent-os/conversation-asset-review.ts";

test("entende revisão explícita de resultado, sem confundir com autorização de render", () => {
  assert.equal(parseCreativeReviewMessage("Aprova esse vídeo"), "approved");
  assert.equal(parseCreativeReviewMessage("Descarta esta imagem"), "rejected");
  assert.equal(parseCreativeReviewMessage("Pode gerar este vídeo"), null);
});
