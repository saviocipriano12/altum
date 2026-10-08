import assert from "node:assert/strict";
import test from "node:test";
import { selectCompatibleModels } from "../lib/server/agent-os/compatible-model-routing.ts";

const catalog = ["qwen-flash", "qwen-plus", "qwen-max", "qwen-coder-plus"];

test("keeps the configured model as the normal safe default", () => {
  assert.deepEqual(selectCompatibleModels({ preferredModel: "qwen-plus", modelCatalog: catalog, prompt: "Explique a proposta comercial." }).slice(0, 2), ["qwen-plus", "qwen-flash"]);
});

test("uses only models discovered by the account for specialized routes", () => {
  assert.equal(selectCompatibleModels({ preferredModel: "qwen-plus", modelCatalog: catalog, prompt: "Corrija este código TypeScript" })[0], "qwen-coder-plus");
  assert.equal(selectCompatibleModels({ preferredModel: "qwen-plus", modelCatalog: catalog, prompt: "Crie uma estratégia completa de campanha" })[0], "qwen-max");
  assert.equal(selectCompatibleModels({ preferredModel: "qwen-plus", modelCatalog: catalog, prompt: "Resuma em três tópicos" })[0], "qwen-flash");
});

test("does not invent alternatives when the provider hides its model catalog", () => {
  assert.deepEqual(selectCompatibleModels({ preferredModel: "qwen-plus", modelCatalog: [], prompt: "Planeje uma campanha" }), ["qwen-plus"]);
});
