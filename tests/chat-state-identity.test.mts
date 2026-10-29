import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getChatStateDocId } from "../lib/server/chat-state-identity.ts";

test("chat state identity preserves legacy keys exactly, including whitespace and separators", () => {
  for (const [tenant, chat] of [["tenant-a", "chat-b"], [" tenant-a ", " chat-b\n"],
    ["tenant_with_underlines", "whatsapp_5511000000000"], ["Loja São Paulo", "cliente-á"], ["", ""], [" a_b", "c_d "]]) {
    assert.equal(getChatStateDocId(tenant, chat), `${tenant.trim()}_${chat.trim()}`);
  }
  assert.equal(getChatStateDocId("tenant-a", "chat-b"), "tenant-a_chat-b");
  assert.notEqual(getChatStateDocId("tenant-a", "chat-b"), getChatStateDocId("tenant-c", "chat-b"));
});

test("delivery and Shopify authorization do not import the conversation engine for an ID", async () => {
  const pure = await readFile(new URL("../lib/server/chat-state-identity.ts", import.meta.url), "utf8");
  assert.doesNotMatch(pure, /^\s*import\s/m, "Identity must not load Firebase, models or providers");
  for (const path of ["chat-outbound.ts", "chat-dispatch.ts", "commerce/shopify-action-authority.ts", "automation-message-delivery.ts"]) {
    const source = await readFile(new URL(`../lib/server/${path}`, import.meta.url), "utf8");
    assert.match(source, /import\s*\{\s*getChatStateDocId\s*\}\s*from\s*["']@\/lib\/server\/chat-state-identity["']/);
    assert.doesNotMatch(source, /import[^;]*from\s*["']@\/lib\/server\/ai\/agent["']/);
  }
  const agent = await readFile(new URL("../lib/server/ai/agent.ts", import.meta.url), "utf8");
  assert.match(agent, /export\s*\{\s*getChatStateDocId\s*\}/, "Old consumers retain their supported export");
});
