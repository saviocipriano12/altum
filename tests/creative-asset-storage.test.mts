import assert from "node:assert/strict";
import test from "node:test";
import { isApprovedProviderAssetUrl } from "../lib/server/agent-os/creative-asset-storage";

test("aceita somente URLs HTTPS dos CDNs de mídia conhecidos", () => {
  assert.equal(isApprovedProviderAssetUrl("https://v3.fal.media/files/video.mp4"), true);
  assert.equal(isApprovedProviderAssetUrl("https://replicate.delivery/pbxt/media.mp4"), true);
  assert.equal(isApprovedProviderAssetUrl("https://cdn.higgsfield.ai/renders/video.mp4"), true);
  assert.equal(isApprovedProviderAssetUrl("https://dashscope-result-sz.oss-cn-shenzhen.aliyuncs.com/output.png?Expires=1"), true);
  assert.equal(isApprovedProviderAssetUrl("http://v3.fal.media/files/video.mp4"), false);
  assert.equal(isApprovedProviderAssetUrl("https://fal.media.evil.test/video.mp4"), false);
  assert.equal(isApprovedProviderAssetUrl("https://example.oss-cn-shenzhen.aliyuncs.com/output.png"), false);
  assert.equal(isApprovedProviderAssetUrl("https://127.0.0.1/internal"), false);
});
