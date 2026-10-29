import test from "node:test";
import assert from "node:assert/strict";
import { isGenericWhatsAppGroupName, whatsAppConversationName } from "../lib/whatsapp-group-name.ts";

Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { resolveWhatsAppGroupName, hydrateWhatsAppGroupNames } = await import("../lib/server/messaging/whatsapp-group-name.ts");
const { fetchEvolutionGroupName } = await import("../lib/server/messaging/evolution-provider.ts");
const tenantId = `qa_group_names_${Date.now()}`;
const channelId = `${tenantId}_current`;
const originalFetch = globalThis.fetch;
test.after(async () => { globalThis.fetch = originalFetch; await adminDb.terminate(); });
await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", provider: "evolution", status: "active",
  accessToken: "fictitious", metadata: { gatewayEndpoint: "https://group-names.invalid", sessionId: "current" } });

async function group(suffix: string, extra: Record<string, unknown> = {}) {
  const id = `${tenantId}_${suffix}`;
  const data = { tenantId, isGroup: true, groupJid: `${suffix}@g.us`, channelId: `${tenantId}_removed`, groupName: "Grupo do WhatsApp", contactName: "Grupo", ...extra };
  await adminDb.collection("chats").doc(id).set(data);
  return { id, ...data };
}
function mockProvider(handler: (url: URL) => Response | Promise<Response>) {
  globalThis.fetch = async (url, init) => String(url).startsWith("https://group-names.invalid/")
    ? handler(new URL(String(url))) : originalFetch(url, init);
}

test("real group label replaces generic fields without a redundant prefix", () => {
  for (const name of ["Grupo", "Grupo do WhatsApp", "Grupo · Grupo do WhatsApp", "12345@g.us", ""]) assert.equal(isGenericWhatsAppGroupName(name), true);
  assert.equal(whatsAppConversationName({ isGroup: true, groupName: "Equipe de vendas", contactName: "Grupo" }), "Equipe de vendas");
  assert.equal(whatsAppConversationName({ isGroup: true, groupName: "Grupo", contactName: "CENTRAL ESB" }), "CENTRAL ESB");
});

test("removed channel recovers the exact group's label without migrating its sending account", async () => {
  const item = await group("1203630001"); let calls = 0;
  mockProvider(url => { calls++; assert.equal(url.searchParams.get("groupJid"), item.groupJid); return Response.json({ id: item.groupJid, subject: "CENTRAL — fictício" }); });
  assert.equal(await resolveWhatsAppGroupName(tenantId, item.id, item), "CENTRAL — fictício");
  const saved = (await adminDb.collection("chats").doc(item.id).get()).data()!;
  assert.equal(saved.channelId, item.channelId);
  assert.equal(saved.contactName, "CENTRAL — fictício");
  assert.equal(await resolveWhatsAppGroupName(tenantId, item.id, saved), "CENTRAL — fictício");
  assert.equal(calls, 1);
});

test("simultaneous opens share the same lookup", async () => {
  const item = await group("1203630002", { channelId }); let calls = 0;
  mockProvider(() => { calls++; return Response.json({ subject: "Equipe" }); });
  assert.deepEqual(await Promise.all([resolveWhatsAppGroupName(tenantId, item.id, item), resolveWhatsAppGroupName(tenantId, item.id, item)]), ["Equipe", "Equipe"]);
  assert.equal(calls, 1);
});

test("disconnected provider keeps the old identity and backs off", async () => {
  const item = await group("1203630003", { channelId }); let calls = 0;
  mockProvider(() => { calls++; return Response.json({ error: "Connection Closed" }, { status: 500 }); });
  assert.equal(await resolveWhatsAppGroupName(tenantId, item.id, item), null);
  const saved = (await adminDb.collection("chats").doc(item.id).get()).data()!;
  assert.equal(await resolveWhatsAppGroupName(tenantId, item.id, saved), null);
  assert.equal(saved.contactName, "Grupo"); assert.equal(saved.channelId, channelId); assert.equal(calls, 1);
});

test("provider route fallback accepts only the requested group", async () => {
  const c = { id: channelId, tenantId, provider: "evolution", source: "tenant_channel" as const, phoneNumberId: channelId,
    gatewayEndpoint: "https://group-names.invalid", sessionId: "current", accessToken: "fake" };
  mockProvider(url => url.pathname.includes("findGroupInfos/") ? Response.json({}, { status: 404 }) : Response.json({ id: "wrong@g.us", subject: "Wrong" }));
  assert.equal(await fetchEvolutionGroupName(c, "requested@g.us"), null);
  mockProvider(url => url.pathname.includes("findGroupInfos/") ? Response.json({}, { status: 404 }) : Response.json({ id: "requested@g.us", subject: "Right" }));
  assert.equal(await fetchEvolutionGroupName(c, "requested@g.us"), "Right");
});

test("scope change or a concurrent verified name cannot be overwritten", async () => {
  const item = await group("1203630004", { channelId });
  mockProvider(async () => { await adminDb.collection("chats").doc(item.id).update({ groupName: "Nome atualizado", contactName: "Nome atualizado" }); return Response.json({ subject: "Nome anterior" }); });
  assert.equal(await resolveWhatsAppGroupName(tenantId, item.id, item), "Nome atualizado");
  const other = await group("1203630005", { channelId });
  mockProvider(async () => { await adminDb.collection("chats").doc(other.id).update({ tenantId: `${tenantId}_other` }); return Response.json({ subject: "Nao gravar" }); });
  assert.equal(await resolveWhatsAppGroupName(tenantId, other.id, other), null);
  assert.equal((await adminDb.collection("chats").doc(other.id).get()).data()?.groupName, "Grupo do WhatsApp");
});

test("list hydration is bounded and returns real names on the first page", async () => {
  const items = await Promise.all([6,7,8,9,10].map(n => group(`12036300${n}`, { channelId })));
  let calls = 0; mockProvider(url => { calls++; return Response.json({ id: url.searchParams.get("groupJid"), subject: `Grupo ${calls}` }); });
  await hydrateWhatsAppGroupNames(tenantId, items);
  assert.equal(calls, 4); assert.equal(items.filter(item => item.contactName !== "Grupo").length, 4);
});

test("foreign tenant and invalid JID never reach the provider", async () => {
  let calls = 0; mockProvider(() => { calls++; return Response.json({ subject: "Wrong" }); });
  const item = await group("1203630011", { groupJid: "not-a-group", channelId });
  assert.equal(await resolveWhatsAppGroupName(tenantId, item.id, item), null);
  assert.equal(await resolveWhatsAppGroupName("foreign", item.id, item), null);
  assert.equal(calls, 0);
});
