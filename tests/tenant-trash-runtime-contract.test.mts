import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("lixeira pagina snapshots e bloqueia manifestos incompletos", async () => {
  const deletion = await source("lib/server/tenant-data-deletion.ts");
  assert.match(deletion, /orderBy\(FieldPath\.documentId\(\)\)/);
  assert.match(deletion, /manifestComplete/);
  assert.match(deletion, /Manifesto incompleto/);
  assert.doesNotMatch(deletion, /\.limit\(5000\)/);
});

test("retencao e configuravel e expurgo inclui Storage e comprovante", async () => {
  const deletion = await source("lib/server/tenant-data-deletion.ts");
  assert.match(deletion, /trashDays/);
  assert.match(deletion, /storage_objects/);
  assert.match(deletion, /deletion_certificates/);
  assert.match(deletion, /ignoreNotFound/);
});

test("expurgo expirado continua ligado ao worker diario", async () => {
  const worker = await source("app/api/internal/jobs/outbound-campaigns/process/route.ts");
  assert.match(worker, /purgeExpiredTenantTrash/);
});

test("Inbox descreve a acao real como mover para lixeira", async () => {
  const inbox = await source("app/cliente/painel/inbox/page.tsx");
  assert.match(inbox, /Mover .* para a lixeira/);
  assert.doesNotMatch(inbox, /Apagar definitivamente .* conversa/);
});
