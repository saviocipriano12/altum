import test from "node:test";
import assert from "node:assert/strict";
import { findExplicitCreativeModelRequest, routeCreativeModel } from "../lib/server/agent-os/creative-model-router.ts";

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

test("providers alternativos usam o modelo certificado para a modalidade", () => {
  const route = routeCreativeModel({ providerId: "replicate", format: "video", prompt: "Vídeo de anúncio" });
  assert.equal(route.model, "bytedance/seedance-1-pro");
  assert.equal(route.purpose, "provider_default");
});

test("uma conexão com padrão de vídeo não vaza esse modelo para imagem", () => {
  const route = routeCreativeModel({ providerId: "replicate", format: "image", prompt: "Imagem de produto" });
  assert.equal(route.model, "black-forest-labs/flux-schnell");
});

test("um modelo indicado pelo operador prevalece sobre a seleção automática", () => {
  const route = routeCreativeModel({ providerId: "replicate", format: "video", prompt: "Vídeo de produto", requestedModel: "minimax/video-01" });
  assert.equal(route.model, "minimax/video-01");
  assert.match(route.reason, /explicitamente/i);
});

test("Higgsfield usa Soul 2 para imagem com continuidade de identidade", () => {
  const route = routeCreativeModel({ providerId: "higgsfield", format: "image", prompt: "Retrato com a personagem aprovada" });
  assert.equal(route.model, "higgsfield-ai/soul/v2/standard");
});

test("Alibaba usa a rota Qwen Image dedicada, sem se passar por executor de vídeo", () => {
  const route = routeCreativeModel({ providerId: "alibaba-model-studio", format: "image", prompt: "Imagem para campanha" });
  assert.equal(route.model, "qwen-image-3.0");
  assert.equal(route.purpose, "image");
});

test("Alibaba usa Wan assíncrono para vídeo", () => {
  const route = routeCreativeModel({ providerId: "alibaba-model-studio", format: "video", prompt: "Vídeo vertical para anúncio" });
  assert.equal(route.model, "wan2.7-t2v");
  assert.equal(route.purpose, "final");
});

test("modelo escrito na conversa só é aceito se pertencer à conexão escolhida", () => {
  const connection = { id: "replicate", providerId: "replicate", capabilities: ["GENERATE_VIDEO"], status: "healthy", modelCatalog: ["minimax/video-01"] };
  assert.equal(findExplicitCreativeModelRequest({ message: "Use Replicate, modelo minimax/video-01", connection, format: "video" }), "minimax/video-01");
  assert.equal(findExplicitCreativeModelRequest({ message: "modelo nao-existe/video", connection, format: "video" }), null);
});
