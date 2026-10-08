import test from "node:test";
import assert from "node:assert/strict";
import { routeCreativeModel } from "../lib/server/agent-os/creative-model-router.ts";

test("vídeo final e realista prioriza a rota de qualidade", () => {
  const route = routeCreativeModel({ providerId: "fal", format: "video", prompt: "Crie o vídeo final realista para a campanha principal." });
  assert.equal(route.model, "bytedance/seedance-2.0/text-to-video");
  assert.equal(route.purpose, "final");
});

test("variações de vídeo priorizam a rota de teste", () => {
  const route = routeCreativeModel({ providerId: "fal", format: "video", prompt: "Faça variações rápidas e baratas para teste." });
  assert.equal(route.model, "xai/grok-imagine-video/text-to-video");
  assert.equal(route.purpose, "draft");
});

test("providers alternativos preservam a rota configurada", () => {
  const route = routeCreativeModel({ providerId: "replicate", format: "video", prompt: "Vídeo de anúncio", fallbackModel: "bytedance/seedance-1-pro" });
  assert.equal(route.model, "bytedance/seedance-1-pro");
  assert.equal(route.purpose, "provider_default");
});

test("Higgsfield usa Soul 2 para imagem com continuidade de identidade", () => {
  const route = routeCreativeModel({ providerId: "higgsfield", format: "image", prompt: "Retrato com a personagem aprovada", fallbackModel: "bytedance/seedance-2.0/text-to-video" });
  assert.equal(route.model, "higgsfield-ai/soul/v2/standard");
});

test("Alibaba usa a rota Qwen Image dedicada, sem se passar por executor de vídeo", () => {
  const route = routeCreativeModel({ providerId: "alibaba-model-studio", format: "image", prompt: "Imagem para campanha", fallbackModel: "qwen-image-3.0" });
  assert.equal(route.model, "qwen-image-3.0");
  assert.equal(route.purpose, "image");
});

test("Alibaba usa Wan assíncrono para vídeo", () => {
  const route = routeCreativeModel({ providerId: "alibaba-model-studio", format: "video", prompt: "Vídeo vertical para anúncio", fallbackModel: "qwen-image-3.0" });
  assert.equal(route.model, "wan2.7-t2v");
  assert.equal(route.purpose, "final");
});
