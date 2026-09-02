import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCatalogImportContent,
  catalogImportTags,
  catalogServiceKey,
  normalizeCatalogImportItem,
  parseCatalogDelimitedText,
  parseCatalogPrice,
} from "../lib/catalog-import.ts";

test("catalog price parser understands Brazilian currency", () => {
  assert.equal(parseCatalogPrice("R$ 1.299,90"), 1299.9);
  assert.equal(parseCatalogPrice("89.50"), 89.5);
  assert.equal(parseCatalogPrice("sob consulta"), null);
});

test("CSV catalog parsing maps Portuguese commercial headers", () => {
  const items = parseCatalogDelimitedText([
    "Nome;Categoria;Preço;Público ideal;Descrição;Benefícios",
    'Plano Pro;Assinatura;R$ 349,90;Times comerciais;CRM completo;Pipeline|Agenda|Relatórios',
    'Implantação;Serviços;1200;Novos clientes;Configuração assistida;Go-live rápido',
  ].join("\n"));

  assert.equal(items.length, 2);
  assert.equal(items[0].name, "Plano Pro");
  assert.equal(items[0].priceFrom, 349.9);
  assert.deepEqual(items[0].benefits, ["Pipeline", "Agenda", "Relatórios"]);
  assert.equal(items[1].kind, "produto");
});

test("catalog import normalization produces safe content and traceable tags", () => {
  const item = normalizeCatalogImportItem({
    tipo: "serviço",
    nome: "Consultoria Comercial",
    categoria: "Consultoria",
    descricao: "Diagnóstico e plano de ação.",
    beneficios: ["Clareza", "Prioridades"],
    preco: "2500",
  });
  assert.ok(item);
  assert.equal(item.kind, "servico");
  assert.equal(catalogServiceKey(item.name), "consultoria_comercial");
  assert.match(buildCatalogImportContent(item), /Principais benefícios: Clareza; Prioridades/);
  assert.deepEqual(
    catalogImportTags(item, "batch_1").slice(0, 4),
    ["catalogo", "tipo:servico", "origem:importacao-inteligente", "categoria:Consultoria"]
  );
});
