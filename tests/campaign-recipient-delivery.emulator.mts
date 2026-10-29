import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns/promises";
import https from "node:https";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { ClientRequest, IncomingMessage } from "node:http";
import type { File, GetSignedUrlConfig } from "@google-cloud/storage";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199", STORAGE_EMULATOR_HOST: "http://127.0.0.1:9199", FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "demo-altum-qa-lab.appspot.com", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb, adminStorage } = await import("../app/lib/server/firebase-admin.ts");
const { deliverCampaignRecipient } = await import("../lib/server/campaign-recipient-delivery.ts");
const { queueTenantCampaignRecipient, processChatOutboundJobs } = await import("../lib/server/chat-outbound.ts");
const { campaignDeliveryId, CampaignRecipientPendingError, CampaignRecipientBlockedError } = await import("../lib/server/campaign-recipient-contract.ts");
import type { CampaignRecipientRequest } from "../lib/server/campaign-recipient-contract.ts";
const { admitCampaignRun } = await import("../lib/server/campaign-run-admission.ts");
const { normalizeOutboundCampaign, dispatchOutboundCampaign, processOutboundCampaignJobs } = await import("../lib/server/outbound-campaigns.ts");
const { normalizeOutboundTemplate } = await import("../lib/server/chat-outbound-template.ts");
const { getChatStateDocId } = await import("../lib/server/ai/agent.ts");
const { persistWhatsappStatusEvents } = await import("../lib/server/whatsapp-delivery-status.ts");
const tenantId = `qa_campaign_recipient_${Date.now()}`, bucket = adminStorage.bucket("demo-altum-qa-lab.appspot.com");
const bytes = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");
let remoteBytes = bytes, downloads = 0, sends = 0, uploads = 0, signs = 0, unknown = false, omitId = false, earlyRead = false;
let duringDownload: (() => Promise<void>) | null = null;
mock.method(dns, "lookup", (async () => [{ address: "93.184.216.34", family: 4 }]) as unknown as typeof dns.lookup);
mock.method(https, "request", ((url: URL, options: https.RequestOptions, callback: (response: IncomingMessage) => void) => {
  assert.equal(url.hostname, "qa-campaign-source.invalid"); assert.equal(options.agent, false); downloads++;
  const fake = new EventEmitter() as ClientRequest;
  fake.end = (() => {
    queueMicrotask(async () => {
      try {
        if (duringDownload) await duringDownload();
        const response = Object.assign(new PassThrough(), { statusCode: 200, headers: { "content-type": "image/png" } });
        callback(response as unknown as IncomingMessage); response.end(remoteBytes);
      } catch (error) { fake.emit("error", error); }
    }); return fake;
  }) as typeof fake.end;
  return fake;
}) as typeof https.request);
mock.method(Object.getPrototypeOf(bucket.file("qa-fixture")), "getSignedUrl", async function (this: File, options: GetSignedUrlConfig) {
  signs++; assert.equal(String(this.generation), String(options.queryParams?.generation));
  return [`https://qa-campaign-copy.invalid/${encodeURIComponent(this.name)}?generation=${this.generation}`];
});
async function verifyLink(raw: string) {
  const url = new URL(raw); assert.equal(url.hostname, "qa-campaign-copy.invalid");
  const path = decodeURIComponent(url.pathname.slice(1)); assert.ok(path.startsWith(`chat-media/${tenantId}/`));
  assert.deepEqual((await bucket.file(path, { generation: url.searchParams.get("generation")! }).download())[0], bytes);
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  if (["127.0.0.1", "localhost"].includes(target.hostname)) return originalFetch(url, options);
  const active = await adminDb.collection("chat_outbound_jobs").where("tenantId", "==", tenantId).where("status", "==", "processing").get();
  assert.equal(active.size, 1); const job = active.docs[0].data(); assert.equal(job.kind, "campaign_delivery"); assert.ok(job.providerAttemptStartedAt);
  const lead = (await adminDb.collection("leads").doc(job.campaignRequest.leadId).get()).data()!;
  assert.equal(lead.campaignDeliveryReservation.jobId, active.docs[0].id);
  if (target.hostname === "graph.facebook.com" && target.pathname.endsWith("/media")) {
    const file = (options?.body as FormData).get("file") as globalThis.File; assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
    uploads++; return Response.json({ id: `qa-campaign-upload-${uploads}` });
  }
  const payload = JSON.parse(String(options?.body));
  if (target.hostname === "legacy-campaign.invalid") { if (payload.mediaUrl) await verifyLink(payload.mediaUrl); }
  else if (target.hostname === "evolution-campaign.invalid") { if (payload.media) assert.equal(payload.media, bytes.toString("base64")); }
  else {
    assert.equal(target.hostname, "graph.facebook.com"); assert.match(target.pathname, /\/qa-campaign-number\/messages$/);
    if (payload.type === "image") assert.equal(payload.image.id, `qa-campaign-upload-${uploads}`);
    const header = payload.template?.components?.find((part: { type: string }) => part.type === "header");
    if (header) await verifyLink(header.parameters[0].image.link);
  }
  sends++; const id = `wamid.qa-campaign-${sends}`;
  if (earlyRead) await persistWhatsappStatusEvents({ tenantId, phoneNumberId: "qa-campaign-number", events: [{ messageId: id, status: "read", timestampMs: Date.now(), recipientId: job.campaignRequest.phone, errorCode: "", errorMessage: "" }] });
  if (unknown) throw new Error("simulated lost recipient acknowledgement");
  if (target.hostname === "evolution-campaign.invalid") return Response.json(omitId ? {} : { key: { id } });
  return Response.json({ messages: omitId ? [] : [{ id }] });
};
let sequence = 0;
async function fixture(name: string, mode: "text" | "template" | "media" | "header" = "text", provider: "meta" | "legacy" | "evolution" = "meta", options?: { delayMs?: number; shared?: { leadId: string; phone: string } }) {
  const leadId = options?.shared?.leadId || `${tenantId}_${name}_lead`, campaignId = `${tenantId}_${name}_campaign`, channelId = `${tenantId}_${name}_channel`, chatId = `${tenantId}_${name}_chat`;
  const phone = options?.shared?.phone || `55110000${String(++sequence).padStart(5, "0")}`;
  await adminDb.collection("tenant_channels").doc(channelId).set({ tenantId, type: "whatsapp", status: "active", provider: provider === "meta" ? "meta_whatsapp" : provider === "legacy" ? "custom_gateway" : "evolution",
    phoneNumberId: "qa-campaign-number", accessToken: "qa-only", metadata: { gatewayEndpoint: `https://${provider === "legacy" ? "legacy-campaign" : "evolution-campaign"}.invalid/send`, sessionId: "qa-instance" } });
  await adminDb.collection("leads").doc(leadId).set({ tenantId, nome: "Cliente QA", telefone: phone, ownerId: "qa-seller", ownerName: "Vendedor QA" });
  await adminDb.collection("chats").doc(chatId).set({ tenantId, leadId, channelId, channel: "whatsapp", channelPhoneNumberId: "qa-campaign-number", contactPhone: phone,
    ownerId: "qa-seller", assignedTo: "qa-seller", lastClientMessageAt: new Date() });
  await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)).set({ tenantId, chatId, aiEnabled: true, humanOwnerUserId: null });
  const source = { url: "https://qa-campaign-source.invalid/material.png", type: "image" as const, filename: "material.png" };
  const payload: CampaignRecipientRequest["payload"] = mode === "media" ? { kind: "media", text: "Ola Cliente QA", source } : mode === "template" || mode === "header"
    ? { kind: "template", text: "Ola Cliente QA", template: normalizeOutboundTemplate({ templateName: "qa_campaign", bodyParams: ["Cliente QA"], headerMedia: mode === "header" ? { type: "image", link: source.url } : null }) }
    : { kind: "text", text: "Ola Cliente QA" };
  const campaignRef = adminDb.collection("outbound_campaigns").doc(campaignId);
  await campaignRef.set({ tenantId, name: "Campanha QA", channelId, messageTemplate: "Ola {nome}", deliveryMode: payload.kind === "template" ? "template" : "text", templateName: "qa_campaign", bodyParams: ["{nome}"],
    headerMedia: mode === "header" || mode === "media" ? { type: "image", link: source.url, filename: source.filename } : null, status: "active", maxRecipients: 1 });
  const snapshot = await campaignRef.get(), campaign = normalizeOutboundCampaign({ id: campaignId, data: snapshot.data()! }), due = new Date(Date.now() + (options?.delayMs ?? -1000)).toISOString();
  const run = await admitCampaignRun({ tenantId, campaignId, actor: { id: "qa-manager", name: "Gestor QA" }, clientRequestId: `recipient-${name}-0001`, scheduledAt: new Date(due),
    plan: async () => ({ campaign, campaignVersion: snapshot.updateTime!, queued: 1, scheduledAt: due, summary: { sent: 0, skipped: 0, failed: 0, selectedByLimit: 1, totalMatched: 1 }, jobs: [{ leadIds: [leadId], dueAt: due }] }) });
  const request: CampaignRecipientRequest = { campaignId, runId: run.runId, leadId, channelId, phone, phoneNumberId: "qa-campaign-number", provider: provider === "meta" ? "meta_whatsapp" : provider === "legacy" ? "legacy_gateway" : "evolution",
    payload, context: { campaignName: "Campanha QA", outboundType: campaign.deliveryMode }, leadName: "Cliente QA", leadSource: "QA" };
  return { tenantId, campaignId, runId: run.runId, leadId, chatId, channelId, request, actor: { id: "qa-manager", name: "Gestor QA" },
    prepare: async () => request };
}
async function queue(input: Awaited<ReturnType<typeof fixture>>) { return queueTenantCampaignRecipient(input); }
after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  for (const collection of ["outbound_campaigns", "outbound_campaign_runs", "outbound_campaign_jobs", "outbound_campaign_deliveries", "tenant_channels", "leads", "chats", "chat_state", "chat_identities", "messages", "chat_outbound_jobs", "chat_outbound_locks", "lead_events", "whatsapp_delivery_events", "crm_observation_jobs", "qa_test_provider_calls"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get(); await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  const [files] = await bucket.getFiles({ prefix: `chat-media/${tenantId}/` });
  await Promise.all(files.map(file => { assert.ok(file.name.startsWith(`chat-media/${tenantId}/`)); return file.delete(); }));
  await adminDb.terminate();
});

for (const mode of ["text", "template", "media", "header"] as const) test(`${mode} recipient has one persistent job/message/receipt on replay`, async () => {
  const input = await fixture(mode, mode), before = sends, beforeSigns = signs;
  const first = await deliverCampaignRecipient(input); await deliverCampaignRecipient({ ...input, prepare: async () => { assert.fail("must reuse accepted content"); } });
  assert.equal(sends, before + 1);
  assert.equal(signs, beforeSigns + (mode === "header" ? 1 : 0));
  const message = (await adminDb.collection("messages").doc(first.messageId).get()).data()!;
  assert.equal(message.text, input.request.payload.text);
  assert.equal((await adminDb.collection("outbound_campaign_deliveries").doc(first.deliveryId).get()).data()?.status, "sent");
  assert.equal((await adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, input.chatId)).get()).data()?.aiEnabled, true);
  assert.equal((await adminDb.collection("chats").doc(input.chatId).get()).data()?.assignedTo, "qa-seller");
  assert.equal((await adminDb.collection("lead_events").where("tenantId", "==", tenantId).where("leadId", "==", input.leadId).get()).size, 1);
});

test("simultaneous callers cannot generate a second delivery", async () => {
  const input = await fixture("concurrent"), before = sends;
  await Promise.allSettled(Array.from({ length: 5 }, () => deliverCampaignRecipient(input)));
  await deliverCampaignRecipient(input); assert.equal(sends, before + 1);
});

for (const missing of [false, true]) test(`uncertain recipient outcome never resends or claims sent (missing ID=${missing})`, async () => {
  const input = await fixture(`unknown-${missing}`), before = sends; unknown = !missing; omitId = missing;
  try {
    await assert.rejects(deliverCampaignRecipient(input), CampaignRecipientPendingError);
    await assert.rejects(deliverCampaignRecipient(input), CampaignRecipientPendingError); assert.equal(sends, before + 1);
    const row = (await adminDb.collection("outbound_campaign_deliveries").doc(campaignDeliveryId(tenantId, input.runId, input.leadId)).get()).data()!;
    assert.equal(row.status, "pending_confirmation"); assert.equal(row.sentAt, undefined);
    assert.equal((await adminDb.collection("leads").doc(input.leadId).get()).data()?.lastOutboundCampaignAt, undefined);
  } finally { unknown = false; omitId = false; }
});

for (const change of ["optout", "phone", "channel"] as const) test(`queued campaign rechecks ${change} before sending`, async () => {
  const input = await fixture(`blocked-${change}`), queued = await queue(input), before = sends;
  if (change === "optout") await adminDb.collection("leads").doc(input.leadId).update({ doNotContact: true });
  if (change === "phone") await adminDb.collection("leads").doc(input.leadId).update({ telefone: "5511000000099" });
  if (change === "channel") await adminDb.collection("chats").doc(input.chatId).update({ channel: "instagram" });
  await processChatOutboundJobs({ jobId: queued.jobId }); assert.equal(sends, before);
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.status, "dead_letter");
});

test("pause waits without consuming delivery failures and resumes the same task", async () => {
  const input = await fixture("pause"), queued = await queue(input), before = sends;
  await adminDb.collection("outbound_campaigns").doc(input.campaignId).update({ status: "paused" });
  await processChatOutboundJobs({ jobId: queued.jobId });
  const ref = adminDb.collection("chat_outbound_jobs").doc(queued.jobId); assert.equal((await ref.get()).data()?.attempts, 0);
  assert.equal((await ref.get()).data()?.status, "retrying"); assert.equal(sends, before);
  await ref.update({ dueAt: new Date(0) }); await adminDb.collection("outbound_campaigns").doc(input.campaignId).update({ status: "active" });
  await deliverCampaignRecipient(input); assert.equal(sends, before + 1);
});

test("a social conversation for the same lead is never converted into WhatsApp", async () => {
  const input = await fixture("social-existing", "template"), social = adminDb.collection("chats").doc(input.chatId);
  await social.update({ channel: "instagram", channelId: "qa-instagram-channel" });
  const delivered = await deliverCampaignRecipient(input); assert.notEqual(delivered.chatId, input.chatId);
  assert.equal((await social.get()).data()?.channel, "instagram"); assert.equal((await social.get()).data()?.channelId, "qa-instagram-channel");
});

test("material resumes from the pinned copy without redownloading a changed source", async () => {
  const input = await fixture("resume-media", "media"), queued = await queue(input), before = { sends, downloads };
  const original = adminDb.runTransaction.bind(adminDb); let number = 0;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    if (++number === 3) throw new Error("interrupted before provider fence"); return original(callback);
  }) as typeof adminDb.runTransaction);
  try { await processChatOutboundJobs({ jobId: queued.jobId }); } finally { hook.mock.restore(); }
  const ref = adminDb.collection("chat_outbound_jobs").doc(queued.jobId); assert.ok((await ref.get()).data()?.campaignAsset);
  remoteBytes = Buffer.from("source changed");
  try { await ref.update({ dueAt: new Date(0) }); await deliverCampaignRecipient(input); assert.equal(downloads, before.downloads + 1); assert.equal(sends, before.sends + 1); }
  finally { remoteBytes = bytes; }
});

test("consent revoked during a download is not converted into another fallback message", async () => {
  const input = await fixture("during-download", "media"), before = sends;
  duringDownload = async () => { await adminDb.collection("leads").doc(input.leadId).update({ doNotContact: true }); };
  try { await assert.rejects(deliverCampaignRecipient(input), CampaignRecipientBlockedError); assert.equal(sends, before); }
  finally { duringDownload = null; }
});

for (const provider of ["legacy", "evolution"] as const) test(`${provider} media retains its supported delivery representation`, async () => {
  const input = await fixture(`provider-${provider}`, "media", provider), before = sends;
  await deliverCampaignRecipient(input); await deliverCampaignRecipient(input); assert.equal(sends, before + 1);
});

test("early read receipt is preserved for the message and campaign delivery", async () => {
  const input = await fixture("read" ); earlyRead = true;
  try {
    const result = await deliverCampaignRecipient(input);
    assert.equal((await adminDb.collection("messages").doc(result.messageId).get()).data()?.deliveryStatus, "read");
    assert.equal((await adminDb.collection("outbound_campaign_deliveries").doc(result.deliveryId).get()).data()?.status, "read");
  } finally { earlyRead = false; }
});

test("batch dispatch consumes accepted content and never increments the same sent count twice", async () => {
  const input = await fixture("batch");
  await adminDb.collection("outbound_campaigns").doc(input.campaignId).update({ messageTemplate: "Conteudo alterado depois do aceite" });
  await processOutboundCampaignJobs({ tenantId, runId: input.runId, limit: 1 });
  const jobs = await adminDb.collection("outbound_campaign_jobs").where("runId", "==", input.runId).get();
  assert.equal(jobs.docs[0].data().status, "completed");
  const before = sends;
  await dispatchOutboundCampaign({ ...input, leadIds: [input.leadId], batchJobId: jobs.docs[0].id });
  assert.equal(sends, before);
  const run = (await adminDb.collection("outbound_campaign_runs").doc(input.runId).get()).data()!;
  assert.equal(run.summary.sent, 1); assert.equal(run.completedJobs, 1);
  const delivery = (await adminDb.collection("outbound_campaign_deliveries").doc(campaignDeliveryId(tenantId, input.runId, input.leadId)).get()).data()!;
  assert.equal(delivery.intendedText, "Ola Cliente QA");
});

test("an uncertain individual delivery cannot complete the batch/run or inflate its counters", async () => {
  const input = await fixture("batch-pending"), before = sends; unknown = true;
  try {
    await processOutboundCampaignJobs({ tenantId, runId: input.runId, limit: 1 });
    const batches = await adminDb.collection("outbound_campaign_jobs").where("runId", "==", input.runId).get();
    assert.equal(batches.docs[0].data().status, "delivery_pending");
    await dispatchOutboundCampaign({ ...input, leadIds: [input.leadId], batchJobId: batches.docs[0].id });
    const run = (await adminDb.collection("outbound_campaign_runs").doc(input.runId).get()).data()!;
    assert.equal(run.status, "running"); assert.equal(run.summary.pending, 1); assert.equal(run.summary.sent, 0); assert.equal(run.completedJobs, 0);
    assert.equal(sends, before + 1);
  } finally { unknown = false; }
});

test("future campaign delivery cannot bypass the planned schedule through direct outbox processing", async () => {
  const input = await fixture("scheduled", "text", "meta", { delayMs: 3600000 }), queued = await queue(input), before = sends;
  await processChatOutboundJobs({ jobId: queued.jobId });
  const job = (await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()!;
  assert.equal(job.status, "retrying"); assert.equal(job.errorCode, "CAMPAIGN_SCHEDULED"); assert.equal(job.attempts, 0); assert.equal(sends, before);
});

test("uncertain contact reservation blocks another sender number from sending again", async () => {
  const first = await fixture("reservation-one"), second = await fixture("reservation-two", "text", "meta", { shared: { leadId: first.leadId, phone: first.request.phone } });
  const one = await queue(first), two = await queue(second), before = sends; unknown = true;
  try { await processChatOutboundJobs({ jobId: one.jobId }); } finally { unknown = false; }
  await processChatOutboundJobs({ jobId: two.jobId });
  assert.equal(sends, before + 1); assert.equal((await adminDb.collection("chat_outbound_jobs").doc(two.jobId).get()).data()?.status, "dead_letter");
});

test("a text campaign outside the service window never substitutes another template", async () => {
  const input = await fixture("closed-window"), before = sends;
  await adminDb.collection("chats").doc(input.chatId).update({ lastClientMessageAt: new Date(0) });
  await assert.rejects(deliverCampaignRecipient(input), CampaignRecipientBlockedError); assert.equal(sends, before);
});

test("unsupported Evolution template is a preflight block, not an uncertain provider attempt", async () => {
  const input = await fixture("evolution-template", "template", "evolution"), before = sends;
  await assert.rejects(deliverCampaignRecipient(input), CampaignRecipientBlockedError);
  const ledger = (await adminDb.collection("outbound_campaign_deliveries").doc(campaignDeliveryId(tenantId, input.runId, input.leadId)).get()).data()!;
  assert.equal((await adminDb.collection("chat_outbound_jobs").doc(ledger.outboundJobId).get()).data()?.providerAttemptStartedAt, undefined); assert.equal(sends, before);
});

test("consent changed after preflight is checked inside the durable delivery fence", async () => {
  const input = await fixture("consent-race"), queued = await queue(input), before = sends;
  const original = adminDb.runTransaction.bind(adminDb); let number = 0;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    if (++number === 2) await adminDb.collection("leads").doc(input.leadId).update({ doNotContact: true }); return original(callback);
  }) as typeof adminDb.runTransaction);
  try { await processChatOutboundJobs({ jobId: queued.jobId }); } finally { hook.mock.restore(); }
  assert.equal(sends, before); assert.equal((await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.providerAttemptStartedAt, undefined);
});

test("lost receipt commit acknowledgement does not downgrade a confirmed delivery or resend", async () => {
  const input = await fixture("receipt-ack"), queued = await queue(input), before = sends, deliveryRef = adminDb.collection("outbound_campaign_deliveries").doc(campaignDeliveryId(tenantId, input.runId, input.leadId));
  const original = adminDb.runTransaction.bind(adminDb); let lost = false;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const result = await original(callback);
    if (!lost && (await deliveryRef.get()).data()?.status === "sent" && (await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).get()).data()?.status === "processing") { lost = true; throw new Error("lost campaign receipt acknowledgement"); }
    return result;
  }) as typeof adminDb.runTransaction);
  try { await processChatOutboundJobs({ jobId: queued.jobId }); } finally { hook.mock.restore(); }
  assert.ok(lost); await assert.rejects(deliverCampaignRecipient(input), CampaignRecipientPendingError);
  assert.equal((await deliveryRef.get()).data()?.status, "sent"); assert.equal(sends, before + 1);
});

test("process loss after provider acceptance cannot resend the campaign recipient", async () => {
  const input = await fixture("process-crash"), before = sends;
  await adminDb.collection("tenant_channels").doc(input.channelId).update({ phoneNumberId: "qa-crash-number" });
  await adminDb.collection("chats").doc(input.chatId).update({ channelPhoneNumberId: "qa-crash-number" });
  input.request.phoneNumberId = "qa-crash-number";
  const queued = await queue(input);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "tests/fixtures/chat-outbound-crash-worker.mts", queued.jobId], { windowsHide: true, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = ""; child.stdout.on("data", c => output += c); child.stderr.on("data", c => output += c);
    child.on("error", reject); child.on("close", code => { try { assert.equal(code, 71, output); resolve(); } catch (error) { reject(error); } });
  });
  const lock = createHash("sha256").update(JSON.stringify(["chat-outbound-lock-v1", tenantId, input.chatId])).digest("hex").slice(0, 48);
  await adminDb.collection("chat_outbound_jobs").doc(queued.jobId).update({ leaseUntil: new Date(0), dueAt: new Date(0) });
  await adminDb.collection("chat_outbound_locks").doc(lock).update({ leaseUntil: new Date(0) });
  await assert.rejects(deliverCampaignRecipient(input), CampaignRecipientPendingError); assert.equal(sends, before);
  assert.equal((await adminDb.collection("qa_test_provider_calls").doc(queued.jobId).get()).exists, true);
});
