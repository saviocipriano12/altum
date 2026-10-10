import assert from "node:assert/strict";
import test from "node:test";
import { alibabaApiRoot, outputUrl } from "../lib/server/agent-os/creative-executor.ts";

test("deriva a API nativa Wan a partir da conexão OpenAI compatível", () => {
  assert.equal(
    alibabaApiRoot("https://workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"),
    "https://workspace.ap-southeast-1.maas.aliyuncs.com/api/v1",
  );
});

test("encontra a URL final de vídeo no contrato de tarefa Wan", () => {
  assert.equal(
    outputUrl({ output: { task_status: "SUCCEEDED", video_url: "https://dashscope-result-sh.oss-accelerate.aliyuncs.com/render.mp4" } }),
    "https://dashscope-result-sh.oss-accelerate.aliyuncs.com/render.mp4",
  );
});

test("encontra a URL final no contrato assíncrono da LTX Cloud", () => {
  assert.equal(
    outputUrl({ result: { video_url: "https://storage.googleapis.com/ltx/render.mp4" } }),
    "https://storage.googleapis.com/ltx/render.mp4",
  );
});
