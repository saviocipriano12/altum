import assert from "node:assert/strict";
import test from "node:test";
import { parseCreativeRenderSelection } from "../lib/server/agent-os/creative-render-selection.ts";

test("pedido natural reutiliza o primeiro conceito da conversa", () => {
  assert.deepEqual(parseCreativeRenderSelection("gere o primeiro conceito em vídeo"), { ordinal: 0 });
  assert.deepEqual(parseCreativeRenderSelection("pode renderizar o segundo criativo"), { ordinal: 1 });
  assert.deepEqual(parseCreativeRenderSelection("produza a terceira imagem"), { ordinal: 2 });
});

test("pedido novo sem referência a um rascunho continua sendo uma missão", () => {
  assert.equal(parseCreativeRenderSelection("crie uma campanha nova para a Altum"), null);
  assert.equal(parseCreativeRenderSelection("crie um novo vídeo para o lançamento"), null);
  assert.equal(parseCreativeRenderSelection("gere outra imagem para esta campanha"), null);
  assert.equal(parseCreativeRenderSelection("o que você recomenda para meus vídeos?"), null);
});
