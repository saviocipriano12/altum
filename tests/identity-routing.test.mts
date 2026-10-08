import test from "node:test";
import assert from "node:assert/strict";
import { selectIdentityProfile } from "../lib/server/agent-os/identity-routing.ts";

const profiles = [
  { id: "savio", tenantId: "altum", displayName: "Savio", identityType: "person" as const, identityAnchor: "Rosto e postura aprovados.", visualStyle: "realista" },
  { id: "luna", tenantId: "altum", displayName: "Luna", identityType: "character" as const, identityAnchor: "Personagem original de cabelo azul." },
];

test("usa a identidade nomeada para um pedido de avatar", () => {
  const result = selectIdentityProfile({ tenantId: "altum", prompt: "Crie um vídeo com meu avatar Savio apresentando a campanha.", profiles });
  assert.equal(result?.id, "savio");
  assert.match(result?.anchor || "", /realista/);
});

test("não injeta identidade em um vídeo que não pede pessoa ou personagem", () => {
  assert.equal(selectIdentityProfile({ tenantId: "altum", prompt: "Crie um vídeo do produto girando no estúdio.", profiles }), null);
});
