import assert from "node:assert/strict";
import test from "node:test";
import { executeCreativeJob, refreshCreativeJob } from "../lib/server/agent-os/creative-executor.ts";

test("xAI video adapter uses the documented asynchronous Imagine contract", async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : null });
    return new Response(JSON.stringify({ request_id: "xai-request-123" }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    const result = await executeCreativeJob(
      { id: "job-xai", capability: "GENERATE_VIDEO", format: "video", prompt: "Vídeo curto de um produto", tenantId: "tenant-1", projectId: "project-1", outputId: "output-1" },
      { providerId: "xai", baseUrl: "https://api.x.ai/v1", credential: "test-key" },
    );
    assert.equal(calls[0].url, "https://api.x.ai/v1/videos/generations");
    assert.equal(calls[0].body?.model, "grok-imagine-video-1.5-lite");
    assert.equal(result.providerStatusUrl, "https://api.x.ai/v1/videos/xai-request-123");
    assert.equal(result.status, "submitted");
  } finally { globalThis.fetch = originalFetch; }
});

test("xAI completed video result is recognized and delivered", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ status: "done", video: { url: "https://files-cdn.x.ai/render.mp4" } }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
  try {
    const result = await refreshCreativeJob({ providerId: "xai", credential: "test-key" }, "https://api.x.ai/v1/videos/xai-request-123");
    assert.equal(result.status, "completed");
    assert.equal(result.assetUrl, "https://files-cdn.x.ai/render.mp4");
  } finally { globalThis.fetch = originalFetch; }
});
