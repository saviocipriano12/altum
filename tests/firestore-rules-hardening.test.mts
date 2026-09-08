import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Firestore preserva o tenant em todas as escritas comerciais", async () => {
  const rules = await source("firestore.rules");

  assert.match(rules, /function tenantIdIsUnchanged\(\)/);
  assert.match(
    rules,
    /match \/leads\/\{leadId\}[\s\S]*?allow update: if tenantIdIsUnchanged\(\) && canWriteCommercialRecord/
  );
  assert.match(
    rules,
    /match \/chats\/\{chatId\}[\s\S]*?allow update: if tenantIdIsUnchanged\(\) && canWriteCommercialRecord/
  );
  assert.doesNotMatch(
    rules,
    /hasTenantMembership\(resource\.data\.tenantId\) \|\| hasTenantMembership\(request\.resource\.data\.tenantId\)/
  );
});

test("documentos de runtime e webhook so podem ser gravados pelo servidor", async () => {
  const rules = await source("firestore.rules");
  const serverOnlyCollections = [
    "chat_state",
    "ai_logs",
    "jobs",
    "metrics",
    "capture_submissions",
    "whatsapp_webhook_events",
    "meta_webhook_events",
  ];

  for (const collection of serverOnlyCollections) {
    const block = new RegExp(`match /${collection}/\\{docId\\} \\{[\\s\\S]*?allow write: if false;`);
    assert.match(rules, block, `${collection} precisa permanecer server-only`);
  }
});

test("Storage vincula metadata ao caminho e proibe sobrescrita", async () => {
  const rules = await source("storage.rules");

  assert.match(rules, /request\.resource\.metadata\.tenantId == tenantId/);
  assert.match(rules, /request\.resource\.metadata\.chatId == chatId/);
  assert.match(rules, /request\.resource\.metadata\.uploadedBy == request\.auth\.uid/);
  assert.match(rules, /allow update: if false;/);
});

test("papel desconhecido falha sem privilegios de agencia", async () => {
  const [serverAuth, clientAuth] = await Promise.all([
    source("app/lib/server/route-auth.ts"),
    source("context/AuthContext.tsx"),
  ]);

  assert.match(serverAuth, /return "client_viewer";/);
  assert.match(clientAuth, /return "client_viewer";/);
  assert.doesNotMatch(serverAuth, /return "agency_agent";\s*\n}\s*\n\s*function normalizeStatus/);
});
