import test from "node:test";
import assert from "node:assert/strict";
import { canonicalOpenAiCompatibleBaseUrl, OPENAI_COMPATIBLE_PROVIDER_IDS } from "../lib/server/agent-os/provider-endpoints.ts";

test("normaliza origens amigáveis para os endpoints oficiais compatíveis", () => {
  assert.equal(canonicalOpenAiCompatibleBaseUrl("groq", "https://api.groq.com"), "https://api.groq.com/openai/v1");
  assert.equal(canonicalOpenAiCompatibleBaseUrl("nvidia-nim", "https://integrate.api.nvidia.com/"), "https://integrate.api.nvidia.com/v1");
  assert.equal(canonicalOpenAiCompatibleBaseUrl("openrouter", "https://openrouter.ai/api/v1"), "https://openrouter.ai/api/v1");
});

test("catálogo de adapters inclui todas as conexões OpenAI-compatíveis suportadas", () => {
  for (const provider of ["alibaba-model-studio", "custom-openai-compatible", "nvidia-nim", "groq", "cerebras", "mistral", "openrouter", "huggingface"]) {
    assert.equal(OPENAI_COMPATIBLE_PROVIDER_IDS.has(provider), true);
  }
});
