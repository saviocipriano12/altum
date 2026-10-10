import assert from "node:assert/strict";
import test from "node:test";
import { findExplicitTextConnectionRequest, orderRuntimeConnections, runtimeCompatibleBaseUrl } from "../lib/server/agent-os/openclaw-model-gateway.ts";

test("runtime completa URLs OpenAI-compatíveis salvas antes do catálogo", () => {
  assert.equal(runtimeCompatibleBaseUrl("groq", "https://api.groq.com"), "https://api.groq.com/openai/v1");
  assert.equal(runtimeCompatibleBaseUrl("nvidia-nim", "https://integrate.api.nvidia.com/"), "https://integrate.api.nvidia.com/v1");
  assert.equal(runtimeCompatibleBaseUrl("openrouter", "https://openrouter.ai/api/v1"), "https://openrouter.ai/api/v1");
  assert.equal(runtimeCompatibleBaseUrl("openai", "https://api.openai.com"), "https://api.openai.com/v1");
  assert.equal(runtimeCompatibleBaseUrl("xai", "https://api.x.ai/"), "https://api.x.ai/v1");
  assert.equal(runtimeCompatibleBaseUrl("google", "https://generativelanguage.googleapis.com/"), "https://generativelanguage.googleapis.com/v1beta/openai");
});

test("runtime preserva a URL explícita de um provider customizado", () => {
  assert.equal(runtimeCompatibleBaseUrl("custom-openai-compatible", "https://models.example.com/v1"), "https://models.example.com/v1");
});

test("pedido explícito coloca a conexão de texto escolhida antes dos fallbacks", () => {
  const connections = [
    { id: "free", providerId: "freellmapi", displayName: "Central gratuita" },
    { id: "groq", providerId: "groq", displayName: "Groq" },
    { id: "router", providerId: "openrouter", displayName: "OpenRouter" },
  ];
  assert.equal(findExplicitTextConnectionRequest({ prompt: "use Groq para responder", connections })?.id, "groq");
  assert.deepEqual(orderRuntimeConnections({ prompt: "via Groq", connections }).connections.map((item) => item.id), ["groq", "free", "router"]);
});

test("texto comum preserva a ordem automática das conexões", () => {
  const connections = [{ id: "free", providerId: "freellmapi" }, { id: "groq", providerId: "groq" }];
  assert.equal(findExplicitTextConnectionRequest({ prompt: "faça um resumo", connections }), null);
  assert.deepEqual(orderRuntimeConnections({ prompt: "faça um resumo", connections }).connections.map((item) => item.id), ["free", "groq"]);
});
