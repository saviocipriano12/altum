import test from "node:test";
import assert from "node:assert/strict";
import { findExplicitMediaConnectionRequest, inferMediaPreference, mediaConnectionAvailability, planMediaConnections, routeAvatarAnchorConnection, routeMediaConnection } from "../lib/server/agent-os/creative-model-router.ts";

const base = { capabilities: ["GENERATE_VIDEO"], status: "approved", scope: "platform" as const };

test("roteador prefere um executor local quando a pessoa pede privacidade", () => {
  const route = routeMediaConnection({
    tenantId: "empresa-a", capability: "GENERATE_VIDEO", prompt: "Gere localmente, sem enviar meu material para fora.",
    connections: [{ ...base, id: "fal", providerId: "fal" }, { ...base, id: "ltx", providerId: "ltx", displayName: "LTX local" }],
  });
  assert.equal(route?.connection.id, "ltx");
  assert.equal(route?.preference, "private");
});

test("roteador prioriza qualidade final sem prender o produto a uma tela", () => {
  const route = routeMediaConnection({
    tenantId: "empresa-a", capability: "GENERATE_VIDEO", prompt: "Quero um vídeo final realista em máxima qualidade.",
    connections: [{ ...base, id: "replicate", providerId: "replicate" }, { ...base, id: "fal", providerId: "fal" }],
  });
  assert.equal(route?.connection.id, "fal");
  assert.equal(inferMediaPreference("vídeo final cinematográfico"), "quality");
});

test("plano preserva alternativas compatíveis para falha de quota ou disponibilidade", () => {
  const plan = planMediaConnections({
    tenantId: "empresa-a", capability: "GENERATE_VIDEO", prompt: "Quero um vídeo final realista em máxima qualidade.",
    connections: [
      { ...base, id: "replicate", providerId: "replicate" },
      { ...base, id: "fal", providerId: "fal" },
      { ...base, id: "higgsfield", providerId: "higgsfield" },
    ],
  });
  assert.deepEqual(plan.routes.map((route) => route.connection.id), ["fal", "higgsfield", "replicate"]);
  assert.match(plan.routes[1].reason, /automaticamente/i);
});

test("roteador remove temporariamente a rota que acabou de falhar e mantém o fallback", () => {
  const now = Date.now();
  const plan = planMediaConnections({
    tenantId: "empresa-a", capability: "GENERATE_VIDEO", prompt: "Quero um vídeo final realista em máxima qualidade.",
    connections: [
      { ...base, id: "fal", providerId: "fal", health: { status: "degraded", cooldownUntil: new Date(now + 60_000), consecutiveFailures: 1 } },
      { ...base, id: "higgsfield", providerId: "higgsfield", health: { status: "healthy", lastSucceededAt: new Date(now) } },
      { ...base, id: "replicate", providerId: "replicate" },
    ],
  });
  assert.deepEqual(plan.routes.map((route) => route.connection.id), ["higgsfield", "replicate"]);
  assert.equal(mediaConnectionAvailability({ status: "approved", health: { status: "degraded", cooldownUntil: new Date(now + 60_000) } }).available, false);
});

test("uma conexão degradada nunca volta para a fila só porque seu cooldown expirou", () => {
  const route = routeMediaConnection({
    tenantId: "empresa-a", capability: "GENERATE_VIDEO", prompt: "Vídeo final",
    connections: [
      { ...base, id: "fal", providerId: "fal", health: { status: "degraded", consecutiveFailures: 0 } },
      { ...base, id: "replicate", providerId: "replicate", health: { status: "healthy" } },
    ],
  });
  assert.equal(route?.connection.id, "replicate");
  assert.equal(mediaConnectionAvailability({ status: "approved", health: { status: "degraded" } }).available, false);
});

test("pedido explícito escolhe somente uma conexão realmente disponível e compatível", () => {
  const connections = [
    { ...base, id: "groq", providerId: "groq", displayName: "Groq", capabilities: ["GENERATE_TEXT"] },
    { ...base, id: "nvidia", providerId: "nvidia-nim", displayName: "NVIDIA NIM", capabilities: ["GENERATE_TEXT"] },
  ];
  assert.equal(findExplicitMediaConnectionRequest({ message: "Use a NVIDIA NIM para isso", connections, tenantId: "empresa-a", capability: "GENERATE_TEXT" })?.id, "nvidia");
  assert.equal(findExplicitMediaConnectionRequest({ message: "Use a Groq", connections: [{ ...connections[0], health: { status: "degraded" } }, connections[1]], tenantId: "empresa-a", capability: "GENERATE_TEXT" }), null);
});

test("âncora de identidade só oferece providers com adaptador validado", () => {
  const route = routeAvatarAnchorConnection({
    tenantId: "empresa-a", prompt: "Minha identidade para vídeos", connections: [
      { ...base, id: "fal", providerId: "fal", capabilities: ["GENERATE_AVATAR_VIDEO"] },
      { ...base, id: "higgsfield", providerId: "higgsfield", capabilities: ["GENERATE_AVATAR_VIDEO"] },
    ],
  });
  assert.equal(route?.connection.id, "higgsfield");
});
