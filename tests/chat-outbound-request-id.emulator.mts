import test from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminAuth, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { queueTenantChatText } = await import("../lib/server/chat-outbound.ts");
const { ChatOutboundPayloadError } = await import("../lib/server/chat-outbound-payload.ts");
const routes = await Promise.all([import("../app/api/tenant/[tenantId]/chats/[chatId]/send/route.ts"),
  import("../app/api/tenant/[tenantId]/chats/[chatId]/send-media/route.ts"),
  import("../app/api/tenant/[tenantId]/chats/[chatId]/send-stored-media/route.ts"),
  import("../app/api/tenant/[tenantId]/chats/[chatId]/send-template/route.ts")]);
const tenantId = `qa_request_id_${Date.now()}`, uid = `${tenantId}_owner`, chatId = `${tenantId}_chat`;

test("authenticated real route handlers reject invalid keys with 400 and no durable side effects", { timeout: 60000 }, async () => {
  try {
    await adminAuth.createUser({ uid, email: `${uid}@qa.invalid`, password: "QaRequestId2026!" });
    await adminDb.collection("tenants").doc(tenantId).set({ tenantId, status: "active", billingStatus: "active", accessStatus: "active" });
    await adminDb.collection("users").doc(uid).set({ tenantId, uid, name: "Ficticio QA", role: "client_owner", status: "active" });
    await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role: "client_owner", status: "active" });
    await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, version: 1, mode: "custom", modules: { inbox: true, whatsapp: true }, limits: {} });
    await adminDb.collection("chats").doc(chatId).set({ tenantId, channel: "whatsapp", assignedTo: uid });
    const login = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-local-only", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `${uid}@qa.invalid`, password: "QaRequestId2026!", returnSecureToken: true }), signal: AbortSignal.timeout(10000),
    });
    assert.equal(login.status, 200);
    const token = (await login.json()).idToken;
    for (const [index, route] of routes.entries()) {
      for (const key of ["short", "a".repeat(180) + "1", "a".repeat(180) + "2", "invalid/key-1234", 123, {}]) {
        const headers: Record<string, string> = { authorization: `Bearer ${token}` };
        let body: BodyInit;
        if (index === 1) {
          const form = new FormData();
          form.append("file", new Blob(["fixture"], { type: "text/plain" }), "fixture.txt");
          if (typeof key === "object") form.append("clientRequestId", new Blob(["invalid-key"]), "key.txt");
          else form.append("clientRequestId", String(key));
          body = form;
        } else {
          headers["content-type"] = "application/json";
          body = JSON.stringify({ text: "Mensagem ficticia", templateName: "qa_template", clientRequestId: key,
            storagePath: `chat-media/${tenantId}/${chatId}/${uid}/missing.txt`, mediaType: "document" });
        }
        const response = await route.POST(new Request("http://127.0.0.1/qa", { method: "POST", headers, body }), {
          params: Promise.resolve({ tenantId, chatId }),
        });
        assert.equal(response.status, 400, `route ${index}, key ${typeof key}: ${await response.clone().text()}`);
        assert.equal((await response.json()).code, "INVALID_OUTBOUND_REQUEST_ID");
      }
    }
    for (const payload of [null, [], 12, { text: 123 }, { text: {} }, { text: "a".repeat(4001) },
      { text: "Valid text", replyToId: "a".repeat(181) }, { text: "Valid text", replyToId: false }, { text: "Valid text", replyToId: "foreign/path" }]) {
      const response = await routes[0].POST(new Request("http://127.0.0.1/qa", { method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(payload) }),
        { params: Promise.resolve({ tenantId, chatId }) });
      assert.equal(response.status, 400, await response.clone().text());
      assert.equal((await response.json()).code, "INVALID_OUTBOUND_PAYLOAD");
    }
    const malformed = await routes[0].POST(new Request("http://127.0.0.1/qa", { method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: "{" }),
      { params: Promise.resolve({ tenantId, chatId }) });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).code, "INVALID_OUTBOUND_PAYLOAD");
    for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads", "chat_outbound_locks"]) {
      assert.equal((await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).size, 0);
    }
    assert.equal((await adminStorage.bucket("demo-altum-qa-lab.appspot.com").getFiles({ prefix: `chat-media/${tenantId}/` }))[0].length, 0);
    assert.equal((await adminDb.collection("chats").doc(chatId).get()).data()?.outboundSequence, undefined);
    // Accepted text must persist verbatim, not merely pass a pure validator.
    const original = "a".repeat(3994) + "\n🙂fim";
    const input = { tenantId, chatId, actor: { id: uid, name: "Ficticio QA" }, text: original, clientRequestId: "boundary-text-0001" };
    const accepted = await queueTenantChatText(input);
    assert.equal((await adminDb.collection("messages").doc(accepted.messageId).get()).data()?.text, original);
    assert.equal((await adminDb.collection("chat_outbound_jobs").doc(accepted.jobId).get()).data()?.text, original);
    assert.equal((await queueTenantChatText(input)).replayed, true);
    await assert.rejects(queueTenantChatText({ ...input, text: original + "x" }), ChatOutboundPayloadError);
    assert.equal((await adminDb.collection("chats").doc(chatId).get()).data()?.outboundSequence, 1);
    assert.equal((await adminDb.collection("messages").where("tenantId", "==", tenantId).get()).size, 1);
  } finally {
    for (const collection of ["messages", "chat_outbound_jobs", "chat_media_uploads", "chat_outbound_locks", "chat_state", "chats", "tenant_users", "users", "tenants", "tenant_entitlements"]) {
      const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
      await Promise.all(rows.docs.map((row) => row.ref.delete()));
    }
    await adminAuth.deleteUser(uid).catch((error: { code?: string }) => { if (error.code !== "auth/user-not-found") throw error; });
    await adminDb.terminate();
  }
});
