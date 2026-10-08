import assert from "node:assert/strict";
import test from "node:test";
import { normalizeOpenAiCompatibleBaseUrl } from "../lib/server/agent-os/openai-compatible.ts";

test("preserva o caminho OpenAI-compatível do provider", () => {
  assert.equal(
    normalizeOpenAiCompatibleBaseUrl("https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/"),
    "https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  );
});

test("não permite transformar uma conexão de IA em acesso a rede privada", () => {
  assert.throws(() => normalizeOpenAiCompatibleBaseUrl("http://127.0.0.1:8000/v1"));
  assert.throws(() => normalizeOpenAiCompatibleBaseUrl("https://user:password@example.com/v1"));
});
