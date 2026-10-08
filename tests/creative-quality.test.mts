import assert from "node:assert/strict";
import test from "node:test";
import { assessCreativeAsset } from "../lib/server/agent-os/creative-quality.ts";

test("pré-revisão criativa valida entrega sem prometer qualidade estética", () => {
  const result = assessCreativeAsset({ type: "video", persistence: "stored", contentType: "video/mp4", size: 4096, identityProfileId: "avatar-1" });
  assert.equal(result.status, "ready_for_review");
  assert.equal(result.checks.some((check) => check.id === "identity" && check.status === "manual_review"), true);
  assert.match(result.summary, /verificações técnicas/i);
});

test("pré-revisão sinaliza ativos externos ou formato incerto", () => {
  const result = assessCreativeAsset({ type: "image", persistence: "external", contentType: null, size: null });
  assert.equal(result.status, "needs_attention");
  assert.equal(result.checks.filter((check) => check.status === "warning").length >= 2, true);
});
