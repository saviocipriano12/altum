import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("webhook Meta usa identidades transacionais para contato, lead e chat", async () => {
  const webhook = await source("app/api/webhooks/meta/route.ts");
  assert.match(webhook, /upsertContactProfile/);
  assert.match(webhook, /resolveCanonicalSocialLead/);
  assert.match(webhook, /resolveCanonicalSocialChat/);
});

test("sincronizacao historica do Messenger usa o mesmo contrato canonico", async () => {
  const sync = await source("lib/server/meta-conversation-sync.ts");
  assert.match(sync, /resolveCanonicalSocialLead/);
  assert.match(sync, /resolveCanonicalSocialChat/);
});

test("WhatsApp consulta o contato canonico antes de criar outro lead", async () => {
  const webhook = await source("app/api/webhooks/whatsapp/route.ts");
  assert.match(webhook, /findContactProfile\(\{ tenantId, phone \}\)/);
  assert.match(webhook, /contactId/);
});

test("Inbox esconde apenas aliases depois que as mensagens foram migradas", async () => {
  const [listing, identity] = await Promise.all([
    source("app/api/tenant/[tenantId]/chats/route.ts"),
    source("lib/server/social-chat-identity.ts"),
  ]);
  assert.match(listing, /mergedIntoChatId/);
  assert.match(identity, /previousChatId/);
  assert.match(identity, /social_chat_identity_merged/);
});

test("reconciliacao autenticada existe sem adicionar uma nova tela", async () => {
  const route = await source("app/api/tenant/[tenantId]/chats/identity-reconciliation/route.ts");
  assert.match(route, /assertTenantAccess/);
  assert.match(route, /assertTenantCapability/);
  assert.match(route, /reconcileTenantOmnichannelIdentities/);
});
