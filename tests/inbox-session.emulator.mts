import test from "node:test";
import assert from "node:assert/strict";

// Fixed emulator endpoints and demo project, before importing the actual server auth.
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { requireRequestUser, RouteAuthError } = await import("../app/lib/server/route-auth.ts");
const { assertTenantAccess, TenantAccessError } = await import("../lib/server/tenant.ts");
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { GET: getMessages } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/messages/route.ts");

async function login() {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
    method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ email: "owner-alpha@qa.invalid", password: "QaLabLocalOnly2026!", returnSecureToken: true }),
  });
  assert.equal(response.status, 200, "The isolated alpha account must exist in Auth Emulator.");
  const payload = await response.json();
  assert.equal(typeof payload.idToken, "string");
  return payload.idToken as string;
}

test.after(async () => { await adminDb.terminate(); });
test("emulator login passes real server token verification and own-tenant membership", async () => {
  const token = await login();
  const user = await requireRequestUser(new Request("http://127.0.0.1:3199/api/tenant/qa-altum-alpha/chats", {
    headers: { Authorization: `Bearer ${token}` },
  }));
  assert.equal(user.uid, "qa-altum-alpha-owner");
  const membership = await assertTenantAccess(user.uid, "qa-altum-alpha");
  assert.equal(membership.tenantId, "qa-altum-alpha");
  assert.equal(membership.role, "client_owner");
});
test("an authenticated alpha operator cannot open beta membership", async () => {
  await assert.rejects(assertTenantAccess("qa-altum-alpha-owner", "qa-altum-beta"), TenantAccessError);
});
test("missing and malformed tokens remain rejected by actual server auth", async () => {
  for (const header of [null, "Bearer not-a-token"]) {
    await assert.rejects(requireRequestUser(new Request("http://127.0.0.1:3199/api/tenant/qa-altum-alpha/chats", {
      headers: header ? { Authorization: header } : {},
    })), RouteAuthError);
  }
});

test("authenticated messages route returns all 220 persisted messages across pages", async () => {
  const token = await login();
  const tenantId = "qa-altum-alpha", chatId = `${tenantId}-chat-1`;
  const ids = new Set<string>();
  let cursor = "";
  let pages = 0;
  for (;;) {
    const params = new URLSearchParams({ limit: "100" });
    if (cursor) { params.set("direction", "older"); params.set("cursor", cursor); }
    const response = await getMessages(new Request(`http://127.0.0.1:3199/api/tenant/${tenantId}/chats/${chatId}/messages?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    }), { params: Promise.resolve({ tenantId, chatId }) });
    assert.equal(response.status, 200);
    const payload = await response.json();
    for (const item of payload.items) {
      assert.match(item.text, /^Mensagem QA alpha\/1\//);
      assert.equal(ids.has(item.id), false, "A message must not appear in two pages.");
      ids.add(item.id);
    }
    pages++;
    if (!payload.hasMore) break;
    assert.equal(typeof payload.nextCursor, "string");
    assert.notEqual(payload.nextCursor, cursor);
    cursor = payload.nextCursor;
    assert.ok(pages < 10, "Pagination must converge.");
  }
  assert.equal(ids.size, 220);
  assert.equal(pages, 3);
});

test("messages route rejects both foreign tenant and foreign chat identifiers", async () => {
  const token = await login();
  for (const [tenantId, chatId] of [["qa-altum-beta", "qa-altum-beta-chat-1"], ["qa-altum-alpha", "qa-altum-beta-chat-1"]]) {
    const response = await getMessages(new Request(`http://127.0.0.1:3199/api/tenant/${tenantId}/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    }), { params: Promise.resolve({ tenantId, chatId }) });
    assert.ok([403, 404].includes(response.status));
    const payload = await response.json();
    assert.equal(payload.items, undefined);
  }
});
