import assert from "node:assert/strict";
import test from "node:test";
import { alibabaApiRoot } from "../lib/server/agent-os/creative-executor.ts";

test("Alibaba native video falls back to the documented international API root", () => {
  assert.equal(
    alibabaApiRoot(undefined),
    "https://dashscope-intl.aliyuncs.com/api/v1",
  );
});

test("Alibaba native video keeps a configured regional endpoint", () => {
  assert.equal(
    alibabaApiRoot("https://dashscope.aliyuncs.com/compatible-mode/v1"),
    "https://dashscope.aliyuncs.com/api/v1",
  );
});
