import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { summarizeSpreadsheet } from "../lib/server/agent-os/command-attachments";

test("resume planilha localmente sem enviar conteúdo a um provider", () => {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Canal", "Vendas"], ["Orgânico", 12], ["Pago", 28]]), "Resultados");
  const bytes = XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const summary = summarizeSpreadsheet(bytes);
  assert.match(summary, /Resultados: 2 registros/);
  assert.match(summary, /Vendas: 2 números; total 40/);
});
