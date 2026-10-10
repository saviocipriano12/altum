import assert from "node:assert/strict";
import test from "node:test";
import { buildCreativeDrafts } from "../lib/server/agent-os/creative-drafts.ts";
import { routeCreativeModel, planMediaConnections } from "../lib/server/agent-os/creative-model-router.ts";
import { hasCreativeProviderContract } from "../lib/server/agent-os/creative-provider-contracts.ts";

test("fal is the only catalogued cloud audio route until each provider has an executor adapter", () => {
  assert.equal(hasCreativeProviderContract({ providerId: "fal" }, "GENERATE_AUDIO"), true);
  assert.equal(hasCreativeProviderContract({ providerId: "replicate" }, "GENERATE_AUDIO"), false);
  assert.equal(hasCreativeProviderContract({ providerId: "higgsfield" }, "GENERATE_AUDIO"), false);

  const plan = planMediaConnections({
    tenantId: "tenant-a",
    capability: "GENERATE_AUDIO",
    prompt: "Crie uma narração curta para o anúncio.",
    connections: [
      { id: "replicate", providerId: "replicate", capabilities: ["GENERATE_AUDIO"], status: "approved", credentialConfigured: true },
      { id: "fal", providerId: "fal", capabilities: ["GENERATE_AUDIO"], status: "approved", credentialConfigured: true },
    ],
  });
  assert.deepEqual(plan.routes.map((route) => route.connection.id), ["fal"]);
});

test("audio jobs select the inspected Fal Chatterbox contract", () => {
  const route = routeCreativeModel({ providerId: "fal", format: "audio", prompt: "Narração de 20 segundos." });
  assert.equal(route.model, "fal-ai/chatterbox/text-to-speech");
  assert.equal(route.purpose, "audio");
});

test("an audio creative draft contains text to narrate, not an image prompt", () => {
  const [draft] = buildCreativeDrafts({
    title: "Narração", brief: "Apresente uma oferta de forma objetiva.", format: "audio", brand: null,
  });
  assert.match(draft.title, /Áudio/i);
  assert.match(draft.content, /Narração/i);
});
