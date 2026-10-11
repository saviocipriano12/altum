import test from "node:test";
import assert from "node:assert/strict";
import { executeCreativeJob } from "../lib/server/agent-os/creative-executor.ts";

test("Higgsfield text-to-video receives the documented conservative Seedance inputs", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  let requestUrl = "";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = String(input);
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ request_id: "request-123", status_url: "https://api.higgsfield.ai/requests/request-123/status" }), {
      status: 202, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    const result = await executeCreativeJob({
      id: "job-1", capability: "GENERATE_VIDEO", format: "video", prompt: "Vídeo vertical de produto", tenantId: "tenant-1", projectId: "project-1", outputId: "output-1",
      creativeModel: "bytedance/seedance-2.0/text-to-video",
    }, { providerId: "higgsfield", credential: "test-key" });
    assert.equal(requestUrl, "https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video");
    assert.deepEqual(requestBody, { prompt: "Vídeo vertical de produto", duration: 5, resolution: "720p", aspect_ratio: "16:9", generate_audio: true });
    assert.equal(result.status, "submitted");
    assert.equal(result.providerJobId, "request-123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Higgsfield Soul 2 keeps a persistent reference and uses its documented image fields", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ request_id: "request-456", status_url: "https://api.higgsfield.ai/requests/request-456/status" }), {
      status: 202, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  try {
    await executeCreativeJob({
      id: "job-2", capability: "GENERATE_IMAGE", format: "image", prompt: "Retrato editorial", tenantId: "tenant-1", projectId: "project-1", outputId: "output-1",
      creativeModel: "higgsfield-ai/soul/v2/standard", identityReferenceId: "123e4567-e89b-12d3-a456-426614174000",
    }, { providerId: "higgsfield", credential: "test-key" });
    assert.deepEqual(requestBody, {
      prompt: "Retrato editorial", batch_size: 1, resolution: "720p", aspect_ratio: "4:3", enhance_prompt: true,
      custom_reference_id: "123e4567-e89b-12d3-a456-426614174000", custom_reference_strength: 1,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
