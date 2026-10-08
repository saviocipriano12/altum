import assert from "node:assert/strict";
import test from "node:test";
import { formatPrivateConversationMemory } from "../lib/server/agent-os/conversation-memory";

test("recupera ideias, memória e conversas anteriores sem incluir a conversa atual", () => {
  const context = formatPrivateConversationMemory({
    memories: [{ summary: "A marca prefere vídeos diretos e realistas.", status: "approved" }],
    ideas: [{ title: "Campanha de novembro", content: "Criar uma campanha com prova social." }],
    turns: [
      { role: "user", content: "Use tom simples.", conversationId: "old", createdAt: "2026-10-01" },
      { role: "user", content: "Não deve entrar.", conversationId: "current", createdAt: "2026-10-02" },
    ],
    currentConversationId: "current",
  });
  assert.match(context, /vídeos diretos/);
  assert.match(context, /Campanha de novembro/);
  assert.match(context, /Use tom simples/);
  assert.doesNotMatch(context, /Não deve entrar/);
});
