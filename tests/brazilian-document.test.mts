import assert from "node:assert/strict";
import test from "node:test";
import { formatBrazilianDocument, isValidBrazilianDocument, normalizeBrazilianDocument } from "../lib/brazilian-document.ts";

test("normaliza e valida CPF", () => {
  assert.equal(normalizeBrazilianDocument("529.982.247-25"), "52998224725");
  assert.equal(isValidBrazilianDocument("529.982.247-25"), true);
  assert.equal(isValidBrazilianDocument("111.111.111-11"), false);
  assert.equal(formatBrazilianDocument("52998224725"), "529.982.247-25");
});

test("normaliza e valida CNPJ", () => {
  assert.equal(isValidBrazilianDocument("04.252.011/0001-10"), true);
  assert.equal(isValidBrazilianDocument("00.000.000/0000-00"), false);
  assert.equal(formatBrazilianDocument("04252011000110"), "04.252.011/0001-10");
});
