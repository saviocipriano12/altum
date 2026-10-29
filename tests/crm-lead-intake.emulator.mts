import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { recordInboundLead } = await import("../lib/server/lead-intake.ts");
const tenantId = `qa_intake_${Date.now()}`, originalFetch = globalThis.fetch;
globalThis.fetch = () => { throw new Error("No external calls in intake QA"); };
after(async () => {
  mock.restoreAll(); globalThis.fetch = originalFetch;
  for (const collection of ["leads", "lead_identities", "pipeline", "tenant_settings", "contacts", "contact_identity_aliases", "capture_submissions", "lead_tasks", "lead_notes", "ai_learning_outcomes", "ai_tenant_learning_daily", "ai_logs", "jobs"]) {
    for (const row of (await adminDb.collection(collection).where("tenantId", "==", tenantId).get()).docs) {
      if (collection === "leads") await adminDb.recursiveDelete(row.ref); else await row.ref.delete();
    }
  }
  await adminDb.terminate();
});
async function fixture(name: string) {
  const leadId = `${tenantId}_${name}`, email = `${name}@qa.invalid`, ref = adminDb.collection("leads").doc(leadId);
  await adminDb.collection("pipeline").doc(tenantId).set({ tenantId, stages: [{ id: "entrada_loja", label: "Entrada" }, { id: "reserva", label: "Separado" }, { id: "finalizado", label: "Finalizado", isTerminal: true }] });
  await ref.set({ tenantId, nome: "Nome revisado pelo vendedor", email, telefone: "", empresa: "Cadastro revisado", ownerId: "qa-seller", owner: "Vendedor QA",
    pipelineStage: "reserva", stage: "reserva", priority: "high", tags: ["Prioridade Humana", "nao-remover"], notes: "Nota interna humana",
    customFields: { humano: "preservado" }, crmFieldOwnership: { pipelineStage: { source: "manual", locked: true }, tags: { source: "manual", locked: true }, priority: { source: "manual", locked: true } } });
  return { leadId, email, ref, input: { tenantId, sourceType: "shopify_order", sourceLabel: "Shopify QA", channel: "ecommerce", email,
    nome: "Nome do checkout antigo", empresa: "Nome externo", telefone: "", defaultOwnerId: "qa-default", defaultOwnerName: "Default QA", defaultPipelineStage: "captado", tags: ["ecommerce"],
    mensagem: "Nova entrada ficticia", customFields: { checkout: "novo" }, skipLeadCreatedWorkflows: true } };
}

async function withPurchases(name: string, count = 1) {
  const input=await fixture(name),contact=adminDb.collection("contacts").doc(`${input.leadId}_person`);
  const purchases=Array.from({length:count},(_,index)=>adminDb.collection("leads").doc(`${input.leadId}_purchase_${index}`));
  await contact.set({tenantId,leadIds:[input.leadId,...purchases.map(ref=>ref.id)]});
  await input.ref.update({contactId:contact.id});
  for(const ref of purchases) await ref.set({tenantId,recordKind:"opportunity",contactId:contact.id,opportunitySourceLeadId:input.leadId,email:input.email,pipelineStage:"reserva",customFields:{orcamento:"9000"},potentialValue:9000});
  return {...input,contact,purchases};
}

test("inbound recognizes a person with several purchases without choosing or overwriting a negotiation",async()=>{
  const input=await withPurchases("multi-purchase",3),before=await Promise.all(input.purchases.map(ref=>ref.get()));
  const result=await recordInboundLead({...input.input,customFields:{orcamento:"2000"}});
  assert.equal(result.leadId,input.leadId);assert.equal(result.created,false);assert.equal(result.requiresOpportunityContext,true);
  assert.deepEqual((await input.ref.get()).data()?.customFields,{humano:"preservado"});
  for(const snapshot of before)assert.ok((await snapshot.ref.get()).updateTime!.isEqual(snapshot.updateTime!));
  assert.equal((await adminDb.collection("leads").where("tenantId","==",tenantId).where("email","==",input.email).get()).size,4);
  const event=(await input.ref.collection("events").where("type","==","shopify_order").get()).docs[0].data();
  assert.deepEqual(event.observed.customFields,{orcamento:"2000"});
});

test("a purchase alone cannot become the intake anchor for a customer's next message",async()=>{
  const input=await withPurchases("purchase-no-anchor");await input.ref.delete();
  const before=await input.purchases[0].get();
  await assert.rejects(recordInboundLead(input.input),/contexto.*oportunidade/i);
  assert.ok((await before.ref.get()).updateTime!.isEqual(before.updateTime!));
  assert.equal((await input.ref.get()).exists,false);
});

test("opportunities sharing an identifier but belonging to different people remain a conflict",async()=>{
  const input=await withPurchases("purchase-other-person"),other=adminDb.collection("contacts").doc(`${input.leadId}_other_person`);
  await other.set({tenantId,leadIds:[input.purchases[0].id]});await input.purchases[0].update({contactId:other.id});
  await assert.rejects(recordInboundLead(input.input),/identidade.*conflitante/i);
  assert.equal((await input.ref.collection("events").get()).size,0);
});

test("identity admission inspects purchases beyond the first candidate page",async()=>{
  const input=await fixture("purchase-pages"),person=adminDb.collection("contacts").doc(`${input.leadId}_person`),other=adminDb.collection("contacts").doc(`${input.leadId}_other`);
  const purchases=Array.from({length:201},(_,index)=>adminDb.collection("leads").doc(`${input.leadId}_purchase_${String(index).padStart(3,"0")}`));
  const batch=adminDb.batch();batch.update(input.ref,{contactId:person.id});batch.set(person,{tenantId,leadIds:[input.leadId,...purchases.map(ref=>ref.id)]});
  for(const ref of purchases)batch.set(ref,{tenantId,recordKind:"opportunity",contactId:person.id,email:input.email,opportunitySourceLeadId:input.leadId});await batch.commit();
  const result=await recordInboundLead(input.input);assert.equal(result.leadId,input.leadId);assert.equal(result.requiresOpportunityContext,true);
  const last=purchases.at(-1)!;await other.set({tenantId,leadIds:[last.id]});await last.update({contactId:other.id});
  const events=(await input.ref.collection("events").get()).size;
  await assert.rejects(recordInboundLead(input.input),/identidade.*conflitante/i);
  assert.equal((await input.ref.collection("events").get()).size,events);
});
test("a Shopify intake preserves manual funnel, owner, tags, priority and reviewed customer information", async () => {
  const input = await fixture("preserve"), result = await recordInboundLead(input.input); assert.equal(result.leadId, input.leadId); assert.equal(result.created, false);
  const lead = (await input.ref.get()).data()!;
  assert.equal(lead.pipelineStage, "reserva"); assert.equal(lead.ownerId, "qa-seller"); assert.deepEqual(lead.tags, ["Prioridade Humana", "nao-remover"]);
  assert.equal(lead.priority, "high"); assert.equal(lead.nome, "Nome revisado pelo vendedor"); assert.equal(lead.empresa, "Cadastro revisado"); assert.equal(lead.notes, "Nota interna humana");
  assert.deepEqual(lead.customFields, { humano: "preservado", checkout: "novo" });
});
test("new lead defaults must use an actual stage from the customized tenant funnel", async () => {
  const input = await fixture("new-setup");
  const result = await recordInboundLead({ ...input.input, email: "new-isolated@qa.invalid", telefone: "", nome: "Novo cliente ficticio" });
  const lead = (await adminDb.collection("leads").doc(result.leadId).get()).data()!;
  assert.equal(result.created, true); assert.equal(lead.pipelineStage, "entrada_loja"); assert.equal(lead.stage, "entrada_loja");
});

test("an edit after identity lookup is re-read, including tags, owner, notes and custom fields", async () => {
  const input = await fixture("race"), { Query } = await import("firebase-admin/firestore"), originalGet = Query.prototype.get;
  let injected = false;
  const interceptor = mock.method(Query.prototype, "get", async function(this: FirebaseFirestore.Query) {
    const snapshot = await originalGet.call(this);
    if (!injected && snapshot.docs.some(doc => doc.ref.path === input.ref.path)) {
      injected = true; await input.ref.update({ ownerId: "qa-new-seller", owner: "Nova responsavel", notes: "Nota revisada durante entrada",
        tags: ["Tag revisada durante entrada"], "customFields.concorrente": "nao perder" });
    }
    return snapshot;
  });
  try {
    assert.equal((await recordInboundLead(input.input)).leadId, input.leadId); assert.equal(injected, true);
    const lead = (await input.ref.get()).data()!; assert.equal(lead.ownerId, "qa-new-seller"); assert.equal(lead.notes, "Nota revisada durante entrada");
    assert.deepEqual(lead.tags, ["Tag revisada durante entrada"]); assert.equal(lead.customFields.concorrente, "nao perder");
  } finally { interceptor.mock.restore(); }
});

test("a lead deleted after lookup is not resurrected by a stale intake snapshot", async () => {
  const input = await fixture("deleted"), { Query } = await import("firebase-admin/firestore"), originalGet = Query.prototype.get;
  let injected = false;
  const interceptor = mock.method(Query.prototype, "get", async function(this: FirebaseFirestore.Query) {
    const snapshot = await originalGet.call(this);
    if (!injected && snapshot.docs.some(doc => doc.ref.path === input.ref.path)) { injected = true; await input.ref.delete(); }
    return snapshot;
  });
  try { await assert.rejects(recordInboundLead(input.input), /excluido/); assert.equal(injected, true); assert.equal((await input.ref.get()).exists, false); }
  finally { interceptor.mock.restore(); }
});

test("submission, intake event and newly observed custom facts commit together without replacing existing notes", async () => {
  const input = await fixture("submission"), result = await recordInboundLead({ ...input.input, submission: { formId: "qa-form", formName: "QA" } });
  assert.equal(result.leadId, input.leadId);
  const entries = await adminDb.collection("capture_submissions").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get();
  assert.equal(entries.size, 1); const events = await input.ref.collection("events").where("type", "==", "shopify_order").get(); assert.equal(events.size, 1);
  assert.equal(events.docs[0].data().observed.message, "Nova entrada ficticia"); assert.equal((await input.ref.get()).data()?.notes, "Nota interna humana");
});
test("failure to commit the intake event cannot partially overwrite the customer", async () => {
  const input = await fixture("rollback"), before = await input.ref.get();
  const { Transaction } = await import("firebase-admin/firestore"), originalCreate = Transaction.prototype.create;
  const interceptor = mock.method(Transaction.prototype, "create", function(this: FirebaseFirestore.Transaction, ref: FirebaseFirestore.DocumentReference, data: FirebaseFirestore.DocumentData) {
    if (ref.path.startsWith(`${input.ref.path}/events/`)) throw new Error("QA_INTAKE_AUDIT_UNAVAILABLE"); return originalCreate.call(this, ref, data);
  });
  try {
    await assert.rejects(recordInboundLead({ ...input.input, submission: { formId: "qa-failed-form" } }), /QA_INTAKE_AUDIT_UNAVAILABLE/);
    assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await intakeBindingRef("email", input.email).get()).exists, false);
    assert.equal((await adminDb.collection("capture_submissions").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 0);
  } finally { interceptor.mock.restore(); }
});

test("a default owner cannot overwrite an existing assignedTo even without the ownerId alias", async () => {
  const input = await fixture("assigned-alias"), { FieldValue } = await import("firebase-admin/firestore");
  await input.ref.update({ ownerId: FieldValue.delete(), assignedTo: "qa-assigned-owner", owner: "Nome atual" });
  await recordInboundLead(input.input); const lead = (await input.ref.get()).data()!;
  assert.equal(lead.assignedTo, "qa-assigned-owner"); assert.equal(lead.ownerId, undefined); assert.equal(lead.owner, "Nome atual");
});

test("an invalid funnel cannot silently create a new lead in a generic stage", async () => {
  const input = await fixture("invalid-setup"); await adminDb.collection("pipeline").doc(tenantId).update({ stages: [] });
  await assert.rejects(recordInboundLead({ ...input.input, email: "invalid-new@qa.invalid", telefone: "" }), /Funil invalido/);
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", tenantId).where("email", "==", "invalid-new@qa.invalid").get()).size, 0);
});

test("existing long notes are not truncated or replaced and new observations remain in the intake event", async () => {
  const input = await fixture("long-notes"), notes = "Nota interna QA ".repeat(400);
  await input.ref.update({ notes }); await recordInboundLead(input.input);
  assert.equal((await input.ref.get()).data()?.notes, notes);
  const events = await input.ref.collection("events").where("type", "==", "shopify_order").get();
  assert.equal(events.size, 1); assert.equal(events.docs[0].data().observed.message, "Nova entrada ficticia");
});

test("conflicting phone and email matches cannot silently choose one customer", async () => {
  const first = await fixture("identity-phone"), second = await fixture("identity-email");
  await first.ref.update({ telefone: "5511999990101" });
  const before = await Promise.all([first.ref.get(), second.ref.get()]);
  await assert.rejects(recordInboundLead({ ...second.input, telefone: "5511999990101" }), /identidade.*conflitante/i);
  for (let i = 0; i < before.length; i++) assert.ok((await before[i].ref.get()).updateTime!.isEqual(before[i].updateTime!));
  assert.equal((await first.ref.collection("events").get()).size, 0);
  assert.equal((await second.ref.collection("events").get()).size, 0);
});

test("historical duplicate emails require reconciliation instead of selecting the first lead", async () => {
  const first = await fixture("duplicate-email-a"), second = await fixture("duplicate-email-b");
  await second.ref.update({ email: first.email });
  await assert.rejects(recordInboundLead(first.input), /identidade.*ambigua/i);
  assert.equal((await first.ref.collection("events").get()).size, 0);
  assert.equal((await second.ref.collection("events").get()).size, 0);
});

test("a source identifier belonging to a different source type is not a customer match", async () => {
  const existing = await fixture("source-scope");
  await existing.ref.update({ sourceId: "qa-shared-source", sourceType: "crm_import", channel: "ecommerce" });
  const result = await recordInboundLead({ ...existing.input, email: "", sourceId: "qa-shared-source", sourceType: "site_chat_conversation" });
  assert.notEqual(result.leadId, existing.leadId); assert.equal(result.created, true);
  assert.equal((await existing.ref.collection("events").get()).size, 0);
});

test("the same raw social profile ID on different channels does not merge customers", async () => {
  const existing = await fixture("social-scope");
  await existing.ref.update({ externalProfileId: "qa-profile-101", channel: "instagram" });
  const result = await recordInboundLead({ ...existing.input, email: "", channel: "messenger", externalProfileId: "qa-profile-101" });
  assert.notEqual(result.leadId, existing.leadId); assert.equal(result.created, true);
  assert.equal((await existing.ref.get()).data()?.channel, "instagram");
});

test("a legacy unscoped social profile requires review rather than an inferred channel", async () => {
  const existing = await fixture("social-unscoped");
  await existing.ref.update({ externalProfileId: "qa-unscoped-profile" });
  await assert.rejects(recordInboundLead({ ...existing.input, email: "", channel: "instagram", externalProfileId: "qa-unscoped-profile" }), /identidade.*sem escopo/i);
  assert.equal((await existing.ref.collection("events").get()).size, 0);
});

test("an identity edited after lookup cannot still authorize writing to the stale customer", async () => {
  const input = await fixture("identity-changed"), { Query } = await import("firebase-admin/firestore"), originalGet = Query.prototype.get;
  let injected = false;
  const interceptor = mock.method(Query.prototype, "get", async function(this: FirebaseFirestore.Query) {
    const snapshot = await originalGet.call(this);
    if (!injected && snapshot.docs.some(doc => doc.ref.path === input.ref.path)) {
      injected = true; await input.ref.update({ email: "changed-by-review@qa.invalid" });
    }
    return snapshot;
  });
  try {
    await assert.rejects(recordInboundLead(input.input), /identidade.*mudou/i); assert.equal(injected, true);
    assert.equal((await input.ref.collection("events").get()).size, 0);
    assert.equal((await input.ref.get()).data()?.email, "changed-by-review@qa.invalid");
  } finally { interceptor.mock.restore(); }
});

test("consistent phone and email identifiers still update one existing customer", async () => {
  const input = await fixture("identity-consistent"); await input.ref.update({ telefone: "5511999990102" });
  const result = await recordInboundLead({ ...input.input, telefone: "5511999990102" });
  assert.equal(result.leadId, input.leadId); assert.equal(result.created, false);
  assert.equal((await input.ref.collection("events").where("type", "==", "shopify_order").get()).size, 1);
});

test("scoped source identifiers still match only inside their original source and channel", async () => {
  const input = await fixture("identity-scoped");
  await input.ref.update({ sourceId: "qa-scoped-source", sourceType: "crm_import", channel: "ecommerce", externalProfileId: "qa-scoped-profile" });
  const result = await recordInboundLead({ ...input.input, sourceId: "qa-scoped-source", sourceType: "crm_import", externalProfileId: "qa-scoped-profile" });
  assert.equal(result.leadId, input.leadId); assert.equal(result.created, false);
  const otherChannel = await recordInboundLead({ ...input.input, email: "", sourceId: "qa-scoped-source", sourceType: "crm_import", channel: "whatsapp" });
  assert.notEqual(otherChannel.leadId, input.leadId); assert.equal(otherChannel.created, true);
});

test("a duplicate inserted after lookup is detected again before the intake commit", async () => {
  const input = await fixture("identity-duplicate-race"), duplicate = await fixture("identity-duplicate-race-other");
  const { Query } = await import("firebase-admin/firestore"), originalGet = Query.prototype.get;
  let injected = false;
  const interceptor = mock.method(Query.prototype, "get", async function(this: FirebaseFirestore.Query) {
    const snapshot = await originalGet.call(this);
    if (!injected && snapshot.docs.some(doc => doc.ref.path === input.ref.path)) {
      injected = true; await duplicate.ref.update({ email: input.email });
    }
    return snapshot;
  });
  try {
    await assert.rejects(recordInboundLead(input.input), /identidade.*ambigua/i); assert.equal(injected, true);
    assert.equal((await input.ref.collection("events").get()).size, 0);
    assert.equal((await duplicate.ref.collection("events").get()).size, 0);
  } finally { interceptor.mock.restore(); }
});

test("a social ID without an input channel cannot create a new unscoped identity", async () => {
  const input = await fixture("identity-no-input-channel");
  await assert.rejects(recordInboundLead({ ...input.input, email: "", channel: "", externalProfileId: "qa-new-unscoped-profile" }), /identidade.*sem escopo/i);
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", tenantId).where("externalProfileId", "==", "qa-new-unscoped-profile").get()).size, 0);
});

function intakeBindingRef(field: "email" | "telefone", value: string) {
  return adminDb.collection("lead_identities").doc(`intake_identity_${createHash("sha256").update(JSON.stringify([tenantId, field, value])).digest("hex")}`);
}

test("concurrent Shopify entries converge successfully to one customer and one creation", async () => {
  const setup = await fixture("concurrent-setup"), email = "concurrent-new@qa.invalid";
  const results = await Promise.all(Array.from({ length: 5 }, () => recordInboundLead({ ...setup.input, email })));
  assert.equal(new Set(results.map(result => result.leadId)).size, 1);
  assert.equal(results.filter(result => result.created).length, 1);
  const leads = await adminDb.collection("leads").where("tenantId", "==", tenantId).where("email", "==", email).get();
  assert.equal(leads.size, 1);
  const binding = (await intakeBindingRef("email", email).get()).data();
  assert.equal(binding?.leadId, results[0].leadId); assert.equal(binding?.protocolVersion, 1);
});

test("a durable intake binding cannot recreate a deleted customer", async () => {
  const input = await fixture("binding-deleted"); await recordInboundLead(input.input);
  assert.equal((await intakeBindingRef("email", input.email).get()).exists, true);
  await input.ref.delete();
  await assert.rejects(recordInboundLead(input.input), /identidade.*(excluida|mudou|ausente)/i);
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", tenantId).where("email", "==", input.email).get()).size, 0);
});

test("a corrupted intake binding cannot select a foreign customer or fall back to creation", async () => {
  const input = await fixture("binding-corrupted"), before = await input.ref.get();
  const binding = intakeBindingRef("email", input.email);
  await binding.set({ tenantId: "qa-other-company", kind: "intake_identity", protocolVersion: 1, leadId: input.leadId });
  try {
    await assert.rejects(recordInboundLead(input.input), /identidade.*invalido/i);
    assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
    assert.equal((await input.ref.collection("events").get()).size, 0);
  } finally { await binding.delete(); }
});

test("concurrent phone-only entries converge and do not require a guessed email identity", async () => {
  const setup = await fixture("phone-concurrent-setup"), telefone = "5511999990103";
  const results = await Promise.all(Array.from({ length: 4 }, () => recordInboundLead({ ...setup.input, email: "", telefone })));
  assert.equal(new Set(results.map(result => result.leadId)).size, 1); assert.equal(results.filter(result => result.created).length, 1);
  assert.equal((await intakeBindingRef("telefone", telefone).get()).data()?.leadId, results[0].leadId);
});

test("an unmatched observed email is not promoted into an alias of a phone-matched customer", async () => {
  const input = await fixture("observed-alternative"); await input.ref.update({ telefone: "5511999990104" });
  const result = await recordInboundLead({ ...input.input, email: "unverified-alternative@qa.invalid", telefone: "5511999990104" });
  assert.equal(result.leadId, input.leadId); assert.equal((await input.ref.get()).data()?.email, input.email);
  assert.equal((await intakeBindingRef("email", "unverified-alternative@qa.invalid").get()).exists, false);
  assert.equal((await intakeBindingRef("telefone", "5511999990104").get()).data()?.leadId, input.leadId);
});

test("a binding to a changed email and an unknown binding protocol both fail closed", async () => {
  const input = await fixture("binding-changed"); await recordInboundLead(input.input);
  await input.ref.update({ email: "revised-binding@qa.invalid" });
  await assert.rejects(recordInboundLead(input.input), /identidade.*(mudou|ausente)/i);
  await input.ref.update({ email: input.email }); await intakeBindingRef("email", input.email).update({ protocolVersion: 99 });
  const before = await input.ref.get(); await assert.rejects(recordInboundLead(input.input), /identidade.*invalido/i);
  assert.ok((await input.ref.get()).updateTime!.isEqual(before.updateTime!));
});

test("a separate process reuses the persisted identity and preserves a later human edit", async () => {
  const input = await fixture("binding-restart"); await recordInboundLead(input.input);
  await input.ref.update({ notes: "Nota humana depois da primeira entrada", ownerId: "qa-reassigned-seller" });
  const output = await new Promise<string>((resolve, reject) => execFile(process.execPath,
    ["--import", "tsx", fileURLToPath(new URL("./fixtures/lead-intake-identity-worker.mts", import.meta.url))], {
      timeout: 25_000, maxBuffer: 8192, env: { ...process.env, QA_INTAKE_TENANT: tenantId, QA_INTAKE_EMAIL: input.email },
    }, (error, stdout) => error ? reject(error) : resolve(stdout)));
  const result = JSON.parse(output); assert.equal(result.leadId, input.leadId); assert.equal(result.created, false);
  const lead = (await input.ref.get()).data()!; assert.equal(lead.notes, "Nota humana depois da primeira entrada"); assert.equal(lead.ownerId, "qa-reassigned-seller");
  assert.equal((await adminDb.collection("leads").where("tenantId", "==", tenantId).where("email", "==", input.email).get()).size, 1);
});
