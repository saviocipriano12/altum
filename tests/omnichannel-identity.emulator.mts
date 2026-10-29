import assert from "node:assert/strict";
import { after, before, test, mock } from "node:test";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ID = "demo-altum-omnichannel-identity";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_identity_${suffix}`;
const otherTenantId = `tenant_identity_other_${suffix}`;

// Standalone runs must never fall back to application-default/real credentials.
// This fixture owns only synthetic tenants in the loopback demo emulators.
Object.assign(process.env, {
  FIREBASE_PROJECT_ID: PROJECT_ID, NEXT_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID, GCLOUD_PROJECT: PROJECT_ID,
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199",
  FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "",
  // Official gcp-metadata switch: local QA must not probe cloud metadata/ADC.
  METADATA_SERVER_DETECTION: "none",
});

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let upsertContactProfile: typeof import("../lib/server/contact-profile.ts").upsertContactProfile;
let findContactProfile: typeof import("../lib/server/contact-profile.ts").findContactProfile;
let contactIdentityAliasId: typeof import("../lib/server/contact-profile.ts").contactIdentityAliasId;
let resolveCanonicalSocialChat: typeof import("../lib/server/social-chat-identity.ts").resolveCanonicalSocialChat;
let resolveCanonicalSocialLead: typeof import("../lib/server/social-lead-identity.ts").resolveCanonicalSocialLead;

before(async () => {
  const admin = await import("../app/lib/server/firebase-admin.ts");
  adminDb = admin.adminDb;
  assert.equal(admin.adminAuth.app.options.projectId, PROJECT_ID, "Only the isolated demo project is authorized");
  ({ upsertContactProfile, findContactProfile, contactIdentityAliasId } = await import("../lib/server/contact-profile.ts"));
  ({ resolveCanonicalSocialChat } = await import("../lib/server/social-chat-identity.ts"));
  ({ resolveCanonicalSocialLead } = await import("../lib/server/social-lead-identity.ts"));
});

after(async () => {
  mock.restoreAll();
  for (const collection of ["contact_identity_aliases", "contacts", "chat_identities", "chats", "lead_identities", "leads", "messages", "audit_logs"]) {
    const snapshots = await adminDb.collection(collection).where("tenantId", "in", [tenantId, otherTenantId]).get();
    await Promise.all(snapshots.docs.map((doc) => doc.ref.delete()));
  }
  await adminDb.terminate();
});

test("20 atualizacoes concorrentes do mesmo perfil criam um contato", async () => {
  const ids = await Promise.all(Array.from({ length: 20 }, () => upsertContactProfile({
    tenantId, channel: "instagram", externalProfileId: "ig-user-1", name: "Cliente Instagram",
  })));
  assert.equal(new Set(ids).size, 1);
  assert.equal((await adminDb.collection("contacts").where("tenantId", "==", tenantId).get()).size, 1);
});

test("contact upsert does not hold pessimistic transaction locks during identity consolidation", async () => {
  const interceptor = mock.method(adminDb, "runTransaction", () => { throw new Error("QA_CONTACT_PESSIMISTIC_LOCK_FORBIDDEN"); });
  try {
    const id = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "optimistic-contact", name: "Pessoa QA" });
    assert.ok(id); assert.equal((await findContactProfile({ tenantId, channel: "instagram", externalProfileId: "optimistic-contact" }))?.id, id);
  } finally { interceptor.mock.restore(); }
});

test("20 aliases distintos do mesmo contato preservam todos os fatos concorrentes", async () => {
  const id = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "shared-canonical-facts", name: "Pessoa revisada QA" });
  assert.ok(id);
  const ref = adminDb.collection("contacts").doc(id);
  await ref.update({ humanNote: "Preservar observacao humana" });
  const emails = Array.from({ length: 20 }, (_, index) => `fact-${index}-${suffix}@qa.invalid`);
  await Promise.all(emails.map(email => adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({ tenantId, type: "email", value: email }))
    .set({ tenantId, type: "email", value: email, contactId: id, identityVersion: 2, createdAt: new Date() })));
  const results = await Promise.all(emails.map((email, index) => upsertContactProfile({ tenantId, email, leadId: `fact-lead-${index}` })));
  assert.ok(results.every(value => value === id));
  const contact = (await ref.get()).data()!;
  assert.deepEqual(new Set(contact.emails), new Set(emails));
  assert.deepEqual(new Set(contact.leadIds), new Set(emails.map((_, index) => `fact-lead-${index}`)));
  assert.equal(contact.name, "Pessoa revisada QA"); assert.equal(contact.humanNote, "Preservar observacao humana");
});

test("four independent processes retain one identity and all twenty distinct observations", async () => {
  const id = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "distributed-profile", name: "Pessoa distribuida QA" });
  const outputs = await Promise.all(["a", "b", "c", "d"].map(worker => new Promise<string[]>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/contact-profile-worker.mts", import.meta.url))], {
      timeout: 25_000, maxBuffer: 8192, env: { ...process.env, QA_CONTACT_TENANT: tenantId, QA_CONTACT_WORKER: worker },
    }, (error, stdout) => {
      if (error) reject(error); else { try { resolve(JSON.parse(stdout)); } catch (parseError) { reject(parseError); } }
    }))));
  assert.ok(outputs.every(values => values.length === 5 && values.every(value => value === id)));
  const contact = (await adminDb.collection("contacts").doc(id!).get()).data()!;
  assert.deepEqual(new Set(contact.leadIds), new Set(["a", "b", "c", "d"].flatMap(worker => Array.from({ length: 5 }, (_, index) => `distributed-${worker}-${index}`))));
});

test("a manual edit after the optimistic read survives the rejected stale commit", async () => {
  const id = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "manual-race", name: "Cliente QA" });
  const ref = adminDb.collection("contacts").doc(id!), { WriteBatch } = await import("firebase-admin/firestore");
  const original = WriteBatch.prototype.commit; let injected = false;
  const interceptor = mock.method(WriteBatch.prototype, "commit", async function(this: FirebaseFirestore.WriteBatch) {
    if (!injected) { injected = true; await ref.update({ name: "Nome revisado manualmente", humanNote: "Nao sobrescrever" }); }
    return original.call(this);
  });
  try {
    assert.equal(await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "manual-race", name: "Nome da integracao", leadId: "manual-race-lead" }), id);
    assert.equal(injected, true);
    const updated = (await ref.get()).data()!;
    assert.equal(updated.name, "Nome revisado manualmente"); assert.equal(updated.humanNote, "Nao sobrescrever");
    assert.ok(updated.leadIds.includes("manual-race-lead"));
  } finally { interceptor.mock.restore(); }
});

for (const target of ["alias", "redirect"] as const) {
  test(`a changed ${target} cannot redirect a stale contact write into another tenant`, async () => {
    const profile = `race-${target}`, id = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: profile, name: "Pessoa local QA" });
    const local = adminDb.collection("contacts").doc(id!), before = await local.get();
    const foreign = adminDb.collection("contacts").doc(`foreign_${target}_${suffix}`), foreignData = { tenantId: otherTenantId, name: "Privado QA", humanNote: "Outro tenant" };
    await foreign.set(foreignData);
    const alias = adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({ tenantId, type: "external", channel: "instagram", value: profile }));
    const redirect = adminDb.collection("contacts").doc(`race_redirect_${target}_${suffix}`);
    if (target === "redirect") { await redirect.set({ tenantId, canonicalContactId: id }); await alias.update({ contactId: redirect.id }); }
    const { WriteBatch } = await import("firebase-admin/firestore"), original = WriteBatch.prototype.commit; let injected = false;
    const interceptor = mock.method(WriteBatch.prototype, "commit", async function(this: FirebaseFirestore.WriteBatch) {
      if (!injected) {
        injected = true;
        if (target === "alias") await alias.update({ contactId: foreign.id });
        else await redirect.update({ canonicalContactId: foreign.id });
      }
      return original.call(this);
    });
    try {
      await assert.rejects(upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: profile, leadId: `forbidden-${target}` }), /tenant|identidade/i);
      assert.equal(injected, true);
      assert.ok((await local.get()).updateTime!.isEqual(before.updateTime!));
      assert.deepEqual((await foreign.get()).data(), foreignData);
      assert.equal(await findContactProfile({ tenantId, channel: "instagram", externalProfileId: profile }), null);
    } finally { interceptor.mock.restore(); }
  });
}

test("profile and aliases remain atomic on storage rejection and a failed writer releases local admission", async () => {
  const { WriteBatch } = await import("firebase-admin/firestore"), before = (await adminDb.collection("contacts").where("tenantId", "==", tenantId).get()).size;
  const input = { tenantId, channel: "instagram", externalProfileId: "atomic-storage-failure", name: "Pessoa atomica QA" };
  const interceptor = mock.method(WriteBatch.prototype, "commit", () => { throw Object.assign(new Error("QA_CONTACT_STORAGE_DENIED"), { code: 7 }); });
  try { await assert.rejects(upsertContactProfile(input), /QA_CONTACT_STORAGE_DENIED/); }
  finally { interceptor.mock.restore(); }
  assert.equal((await adminDb.collection("contacts").where("tenantId", "==", tenantId).get()).size, before);
  assert.equal(await findContactProfile(input), null);
  const id = await upsertContactProfile(input); assert.ok(id);
  assert.equal((await findContactProfile(input))?.id, id);
});

test("IDs externos iguais em canais diferentes nao juntam pessoas por engano", async () => {
  const instagram = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "shared-raw-id" });
  const messenger = await upsertContactProfile({ tenantId, channel: "messenger", externalProfileId: "shared-raw-id" });
  assert.notEqual(instagram, messenger);
});

test("telefone ou email comprovado une canais e preserva aliases anteriores", async () => {
  const phoneOnly = await upsertContactProfile({ tenantId, channel: "whatsapp", phone: "(11) 99999-0000", leadId: "lead-phone" });
  const socialOnly = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "ig-bridge", leadId: "lead-social" });
  assert.notEqual(phoneOnly, socialOnly);
  const bridged = await upsertContactProfile({
    tenantId, channel: "instagram", externalProfileId: "ig-bridge", phone: "5511999990000", email: "Pessoa@Exemplo.com",
  });
  const [byPhone, bySocial, byEmail] = await Promise.all([
    findContactProfile({ tenantId, phone: "5511999990000" }),
    findContactProfile({ tenantId, channel: "instagram", externalProfileId: "ig-bridge" }),
    findContactProfile({ tenantId, email: "pessoa@exemplo.com" }),
  ]);
  assert.equal(byPhone?.id, bridged);
  assert.equal(bySocial?.id, bridged);
  assert.equal(byEmail?.id, bridged);
  assert.deepEqual(new Set(byPhone?.leadIds as string[]), new Set(["lead-phone", "lead-social"]));
});

test("chat social e criado uma vez sob concorrencia e fica separado por conta", async () => {
  const input = {
    tenantId, channel: "instagram" as const, channelId: "ig-account-1", externalProfileId: "ig-customer-1",
    createData: { tenantId, channel: "instagram", channelId: "ig-account-1", contactExternalId: "ig-customer-1", createdAt: new Date() },
  };
  const results = await Promise.all(Array.from({ length: 20 }, () => resolveCanonicalSocialChat(input)));
  assert.equal(new Set(results.map((item) => item.chatRef.id)).size, 1);
  const anotherAccount = await resolveCanonicalSocialChat({ ...input, channelId: "ig-account-2", createData: { ...input.createData, channelId: "ig-account-2" } });
  assert.notEqual(anotherAccount.chatRef.id, results[0].chatRef.id);
});

test("lead social usa a identidade canonica do contato sob concorrencia", async () => {
  const contactId = await upsertContactProfile({ tenantId, channel: "messenger", externalProfileId: "msg-customer-1" });
  assert.ok(contactId);
  const input = {
    tenantId, contactId, channel: "messenger" as const, externalProfileId: "msg-customer-1",
    createData: { tenantId, contactId, channel: "messenger", externalProfileId: "msg-customer-1", nome: "Pessoa", createdAt: new Date() },
  };
  const results = await Promise.all(Array.from({ length: 20 }, () => resolveCanonicalSocialLead(input)));
  assert.equal(new Set(results.map((item) => item.leadRef.id)).size, 1);
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", tenantId).get()).size, 1);
});

test("duplicidade social legada vira alias sem deixar mensagens orfas", async () => {
  const firstId = `legacy_social_first_${suffix}`;
  const secondId = `legacy_social_second_${suffix}`;
  await Promise.all([
    adminDb.collection("chats").doc(firstId).set({ tenantId, channel: "messenger", channelId: "legacy-page", contactExternalId: "legacy-user", createdAt: new Date(1) }),
    adminDb.collection("chats").doc(secondId).set({ tenantId, channel: "messenger", channelId: "legacy-page", contactExternalId: "legacy-user", createdAt: new Date(2) }),
    adminDb.collection("messages").doc(`legacy_message_first_${suffix}`).set({ tenantId, chatId: firstId, text: "primeira" }),
    adminDb.collection("messages").doc(`legacy_message_second_${suffix}`).set({ tenantId, chatId: secondId, text: "segunda" }),
  ]);
  const resolved = await resolveCanonicalSocialChat({
    tenantId, channel: "messenger", channelId: "legacy-page", externalProfileId: "legacy-user",
    createData: { tenantId, channel: "messenger", channelId: "legacy-page", contactExternalId: "legacy-user" },
  });
  assert.equal(resolved.chatRef.id, firstId);
  assert.equal((await adminDb.collection("chats").doc(secondId).get()).data()?.mergedIntoChatId, firstId);
  assert.equal((await adminDb.collection("messages").where("chatId", "==", firstId).get()).size, 2);
  assert.equal((await adminDb.collection("messages").where("chatId", "==", secondId).get()).size, 0);
});

test("a mesma identidade nunca atravessa tenants", async () => {
  const left = await upsertContactProfile({ tenantId, phone: "5511988887777", channel: "whatsapp" });
  const right = await upsertContactProfile({ tenantId: otherTenantId, phone: "5511988887777", channel: "whatsapp" });
  assert.notEqual(left, right);
});

test("alias corrompido nao importa dados nem altera contato de outro tenant", async () => {
  const foreignId = `foreign_contact_${suffix}`;
  const aliasRef = adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({
    tenantId, type: "external", channel: "instagram", value: "corrupted-alias",
  }));
  const foreignRef = adminDb.collection("contacts").doc(foreignId);
  const foreignData = { tenantId: otherTenantId, phone: "5511977776666", name: "Contato privado QA" };
  await foreignRef.set(foreignData);
  await aliasRef.set({ tenantId, contactId: foreignId });
  await assert.rejects(() => upsertContactProfile({
    tenantId, channel: "instagram", externalProfileId: "corrupted-alias",
  }), /tenant|empresa|identidade/i);
  assert.deepEqual((await foreignRef.get()).data(), foreignData);
  assert.equal((await aliasRef.get()).data()?.contactId, foreignId);
  assert.equal(await findContactProfile({ tenantId, channel: "instagram", externalProfileId: "corrupted-alias" }), null);
});

test("alias com empresa divergente e recusado mesmo apontando para contato local", async () => {
  const localId = `local_alias_target_${suffix}`;
  const contactRef = adminDb.collection("contacts").doc(localId);
  const original = { tenantId, name: "Contato local QA" };
  await contactRef.set(original);
  await adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({
    tenantId, type: "external", channel: "messenger", value: "wrong-alias-tenant",
  })).set({ tenantId: otherTenantId, contactId: localId });
  assert.equal(await findContactProfile({ tenantId, channel: "messenger", externalProfileId: "wrong-alias-tenant" }), null);
  await assert.rejects(() => upsertContactProfile({
    tenantId, channel: "messenger", externalProfileId: "wrong-alias-tenant",
  }), /tenant/i);
  assert.deepEqual((await contactRef.get()).data(), original);
});

test("redirecionamento canonico nao pode atravessar outra empresa e voltar", async () => {
  const localId = `redirect_local_${suffix}`;
  const foreignId = `redirect_foreign_${suffix}`;
  const rootId = `redirect_root_${suffix}`;
  const refs = [localId, foreignId, rootId].map((id) => adminDb.collection("contacts").doc(id));
  const originals = [
    { tenantId, canonicalContactId: foreignId },
    { tenantId: otherTenantId, canonicalContactId: rootId, email: "privado@qa.invalid" },
    { tenantId, name: "Raiz local QA" },
  ];
  await Promise.all(refs.map((ref, index) => ref.set(originals[index])));
  await adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({
    tenantId, type: "external", channel: "instagram", value: "foreign-redirect",
  })).set({ tenantId, contactId: localId });
  assert.equal(await findContactProfile({ tenantId, channel: "instagram", externalProfileId: "foreign-redirect" }), null);
  await assert.rejects(() => upsertContactProfile({
    tenantId, channel: "instagram", externalProfileId: "foreign-redirect",
  }), /tenant/i);
  for (let index = 0; index < refs.length; index += 1) {
    assert.deepEqual((await refs[index].get()).data(), originals[index]);
  }
});

test("atualizacao segue cadeia canonica inteira e preserva a raiz definitiva", async () => {
  const ids = [0, 1, 2, 3, 4].map((index) => `chain_${index}_${suffix}`);
  await Promise.all(ids.map((id, index) => adminDb.collection("contacts").doc(id).set({
    tenantId, ...(index < ids.length - 1 ? { canonicalContactId: ids[index + 1] } : {}),
    leadIds: [`chain-lead-${index}`],
  })));
  await adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({
    tenantId, type: "external", channel: "instagram", value: "chain-user",
  })).set({ tenantId, contactId: ids[0] });
  assert.equal((await findContactProfile({ tenantId, channel: "instagram", externalProfileId: "chain-user" }))?.id, ids.at(-1));
  const result = await upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: "chain-user" });
  assert.equal(result, ids.at(-1));
  const contact = await findContactProfile({ tenantId, channel: "instagram", externalProfileId: "chain-user" });
  assert.equal(contact?.id, ids.at(-1));
  assert.deepEqual(new Set(contact?.leadIds as string[]), new Set(ids.map((_, index) => `chain-lead-${index}`)));
  assert.equal((await adminDb.collection("contacts").doc(ids.at(-1)!).get()).data()?.canonicalContactId, undefined);
});

test("ciclo e destino canonico ausente sao recusados sem gravar", async () => {
  for (const mode of ["cycle", "missing"] as const) {
    const first = `invalid_${mode}_a_${suffix}`;
    const second = `invalid_${mode}_b_${suffix}`;
    const original = { tenantId, canonicalContactId: second };
    await adminDb.collection("contacts").doc(first).set(original);
    if (mode === "cycle") await adminDb.collection("contacts").doc(second).set({ tenantId, canonicalContactId: first });
    await adminDb.collection("contact_identity_aliases").doc(contactIdentityAliasId({
      tenantId, type: "external", channel: "instagram", value: `invalid-${mode}`,
    })).set({ tenantId, contactId: first });
    assert.equal(await findContactProfile({ tenantId, channel: "instagram", externalProfileId: `invalid-${mode}` }), null);
    await assert.rejects(() => upsertContactProfile({ tenantId, channel: "instagram", externalProfileId: `invalid-${mode}` }), /canonic|identidade/i);
    assert.deepEqual((await adminDb.collection("contacts").doc(first).get()).data(), original);
  }
});
