import test from "node:test";
import assert from "node:assert/strict";
import { executeCreativeJobWithFallback } from "../lib/server/agent-os/creative-executor.ts";

test("executor tenta a próxima conexão compatível quando a primeira recusa o job", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("first.example")) return new Response(JSON.stringify({ error: "quota exhausted" }), { status: 429, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ status: "completed", jobId: "second-job", assetUrl: "https://provider.example/result.png" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await executeCreativeJobWithFallback({
      job: { id: "job-1", capability: "GENERATE_IMAGE", format: "image", prompt: "Uma campanha", tenantId: "tenant-1", projectId: "project-1", outputId: "output-1" },
      candidates: [
        { id: "first", connection: { providerId: "custom-openai-compatible", baseUrl: "https://first.example/render", credential: "test-key" } },
        { id: "second", connection: { providerId: "custom-openai-compatible", baseUrl: "https://second.example/render", credential: "test-key" } },
      ],
    });
    assert.equal(result.connectionId, "second");
    assert.equal(result.providerJobId, "second-job");
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].status, "failed");
    assert.equal(result.attempts[1].status, "completed");
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
