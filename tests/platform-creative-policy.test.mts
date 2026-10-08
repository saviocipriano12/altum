import test from "node:test";
import assert from "node:assert/strict";
import { classifyPlatformRender } from "../lib/server/mcp/platform-creative-policy.ts";

test("asynchronous render with status URL stays submitted", () => {
  assert.equal(classifyPlatformRender({ status: "submitted", providerStatusUrl: "https://provider.example/status/1", assetUrl: null }, null, false), "submitted");
});
test("accepted render without status URL requires reconciliation", () => {
  assert.equal(classifyPlatformRender({ status: "submitted", providerStatusUrl: null, assetUrl: null }, null, false), "needs_reconciliation");
});
test("completed render without durable asset cannot be delivered", () => {
  assert.equal(classifyPlatformRender({ status: "completed", providerStatusUrl: null, assetUrl: "https://provider.example/result.png" }, null, false), "needs_reconciliation");
});
test("completed render with durable asset can be delivered", () => {
  assert.equal(classifyPlatformRender({ status: "completed", providerStatusUrl: null, assetUrl: "https://provider.example/result.png" }, null, true), "completed");
});
