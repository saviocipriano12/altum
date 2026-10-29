import test, { before, after } from "node:test";
import assert from "node:assert/strict";
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_PRIVATE_KEY: "", FIREBASE_CLIENT_EMAIL: "", GOOGLE_APPLICATION_CREDENTIALS: "",
});
const { adminDb, adminAuth } = await import("../app/lib/server/firebase-admin.ts");
const { PATCH } = await import("../app/api/tenant/[tenantId]/chats/[chatId]/route.ts");
const { persistConversationAssignment } = await import("../lib/server/conversation-assignment.ts");
const tenantId = `qa_assignment_${Date.now()}`, chatId = `${tenantId}_chat`, leadId = `${tenantId}_lead`;
const ids = { first: `${tenantId}_first`, second: `${tenantId}_second`, manager: `${tenantId}_manager` };
const tokens = new Map<string, string>();
const chat = adminDb.collection("chats").doc(chatId), state = adminDb.collection("chat_state").doc(`${tenantId}_${chatId}`), lead = adminDb.collection("leads").doc(leadId);
before(async () => {
  await adminDb.collection("tenant_entitlements").doc(tenantId).set({ tenantId, mode: "custom", modules: { inbox: true }, limits: {} });
  for (const [key, uid] of Object.entries(ids)) {
    const role = key === "manager" ? "client_owner" : "client_agent", email = `${uid}@qa.invalid`;
    await adminAuth.createUser({ uid, email, password: "QaAssignment2026!" });
    await adminDb.collection("users").doc(uid).set({ tenantId, uid, name: key, role, status: "active" });
    await adminDb.collection("tenant_users").doc(`${tenantId}_${uid}`).set({ tenantId, userId: uid, role, status: "active" });
    const result = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=qa-only", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "QaAssignment2026!", returnSecureToken: true }),
    });
    assert.equal(result.status, 200); tokens.set(key, (await result.json()).idToken);
  }
});
after(async () => {
  for (const collection of ["chats", "chat_state", "leads", "messages", "users", "tenant_users", "tenant_entitlements"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) await row.ref.delete();
  }
  for (const uid of Object.values(ids)) await adminAuth.deleteUser(uid);
  await adminDb.terminate();
});
async function reset() {
  await chat.set({ tenantId, leadId, assignedTo: ids.first, ownerId: ids.first, tags: ["cliente"], status: "open", lastClientMessageAt: new Date(), slaDueAt: new Date(Date.now() + 60000) });
  await state.set({ tenantId, chatId, aiEnabled: false, humanOwnerUserId: ids.first, pauseReason: "human_takeover" });
  await lead.set({ tenantId, ownerId: ids.first });
}
function patch(actor: string, assignedUserId: string | null) {
  return PATCH(new Request("http://localhost/qa-assignment", { method: "PATCH", headers: { authorization: `Bearer ${tokens.get(actor)}`, "content-type": "application/json" }, body: JSON.stringify({ assignedUserId }) }), { params: Promise.resolve({ tenantId, chatId }) });
}
test("an attendant can return their own conversation without resuming AI or erasing tags", async () => {
  await reset(); const result = await patch("first", null); assert.equal(result.status, 200, await result.text());
  assert.equal((await chat.get()).data()?.assignedTo, null); assert.deepEqual((await chat.get()).data()?.tags, ["cliente"]);
  assert.equal((await state.get()).data()?.humanOwnerUserId, null); assert.equal((await state.get()).data()?.aiEnabled, false);
  assert.equal((await state.get()).data()?.pauseReason, "returned_to_queue"); assert.equal((await lead.get()).data()?.ownerId, null);
});
test("a manager transfer updates the chat, human control and lead together", async () => {
  await reset(); const result = await patch("manager", ids.second); assert.equal(result.status, 200, await result.text());
  assert.equal((await chat.get()).data()?.assignedTo, ids.second); assert.equal((await state.get()).data()?.humanOwnerUserId, ids.second);
  assert.equal((await lead.get()).data()?.ownerId, ids.second); assert.equal((await state.get()).data()?.aiEnabled, false);
});
test("an attendant cannot transfer ownership to someone else", async () => {
  await reset(); assert.equal((await patch("first", ids.second)).status, 403);
  assert.equal((await chat.get()).data()?.assignedTo, ids.first); assert.equal((await state.get()).data()?.humanOwnerUserId, ids.first);
});
test("a stale transfer cannot overwrite a newer owner", async () => {
  await reset(); await chat.update({ assignedTo: ids.second });
  await assert.rejects(persistConversationAssignment({ tenantId, chatId, expectedOwner: ids.first, patch: { assignedTo: null }, actorId: ids.first, actorName: "first" }), /responsável mudou/);
  assert.equal((await chat.get()).data()?.assignedTo, ids.second);
});
