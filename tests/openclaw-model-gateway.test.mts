import assert from "node:assert/strict";
import test from "node:test";
import { runtimeCompatibleBaseUrl } from "../lib/server/agent-os/openclaw-model-gateway.ts";

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
