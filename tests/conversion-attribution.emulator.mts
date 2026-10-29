import assert from "node:assert/strict";
import { after, before, test } from "node:test";

const PROJECT_ID = "demo-altum-conversion-attribution";
const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const tenantId = `tenant_conversion_${suffix}`;
const leadId = `lead_conversion_${suffix}`;
const channelId = `meta_conversion_${suffix}`;

process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = PROJECT_ID;
process.env.GCLOUD_PROJECT = PROJECT_ID;

let adminDb: typeof import("../app/lib/server/firebase-admin.ts").adminDb;
let applyInboundCampaignAttribution: typeof import("../lib/server/lead-intake.ts").applyInboundCampaignAttribution;
let dispatchLeadConversionEvents: typeof import("../lib/server/pixels/conversions.ts").dispatchLeadConversionEvents;
let processConversionDispatchJobs: typeof import("../lib/server/pixels/conversions.ts").processConversionDispatchJobs;
const originalFetch = globalThis.fetch;

before(async () => {
  ({ adminDb } = await import("../app/lib/server/firebase-admin.ts"));
  ({ applyInboundCampaignAttribution } = await import("../lib/server/lead-intake.ts"));
  ({ dispatchLeadConversionEvents, processConversionDispatchJobs } = await import("../lib/server/pixels/conversions.ts"));
  await adminDb.collection("leads").doc(leadId).set({
    tenantId, nome: "Cliente Campanha", telefone: "5511999999999", channel: "whatsapp", createdAt: new Date(), updatedAt: new Date(),
  });
  await adminDb.collection("tenant_channels").doc(channelId).set({
    tenantId, type: "meta_ads", status: "active", metadata: { pixelId: "pixel-test", accessToken: "token-test", pageId: "page-test" },
  });
});

after(async () => {
  globalThis.fetch = originalFetch;
  for (const collection of ["conversion_dispatches", "tenant_channels", "leads", "outbound_campaign_deliveries", "ad_creative_snapshots"]) {
    const snapshots = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(snapshots.docs.map((doc) => doc.ref.delete()));
  }
});

test("primeiro toque e preservado e novo anuncio vira ultimo toque", async () => {
  await applyInboundCampaignAttribution({
    tenantId, leadId, channel: "whatsapp", sourceType: "whatsapp_inbound", sourceLabel: "WhatsApp via anuncio Meta",
    campaign: { name: "Campanha A", source: "meta", medium: "whatsapp_referral", adId: "ad-a", clickId: "ctwa-a" },
  });
  await applyInboundCampaignAttribution({
    tenantId, leadId, channel: "whatsapp", sourceType: "whatsapp_inbound", sourceLabel: "WhatsApp via anuncio Meta",
    campaign: { name: "Campanha B", source: "meta", medium: "whatsapp_referral", adId: "ad-b", clickId: "ctwa-b" },
  });
  const lead = (await adminDb.collection("leads").doc(leadId).get()).data()!;
  assert.equal(lead.first_touch.campaign, "Campanha A");
  assert.equal(lead.first_touch.ctwaClid, "ctwa-a");
  assert.equal(lead.last_touch.campaign, "Campanha B");
  assert.equal(lead.last_touch.adId, "ad-b");
  assert.equal(lead.ctwaClid, "ctwa-b");
});

test("20 disparos concorrentes enviam uma unica conversao com identidade estavel", async () => {
  const requests: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const results = await Promise.all(Array.from({ length: 20 }, () => dispatchLeadConversionEvents({
    tenantId, leadId, reason: "lead_created", conversionKey: "origin", occurredAt: "2026-10-13T12:00:00.000Z",
  })));
  assert.equal(requests.length, 1);
  const jobs = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  assert.equal(jobs.size, 1);
  assert.equal(jobs.docs[0].data().status, "processed");
  assert.equal(jobs.docs[0].data().attempts, 1);
  const event = (requests[0].data as Array<Record<string, unknown>>)[0];
  assert.equal(event.action_source, "business_messaging");
  assert.equal(event.messaging_channel, "whatsapp");
  assert.equal((event.user_data as Record<string, unknown>).page_id, "page-test");
  assert.equal((event.user_data as Record<string, unknown>).ctwa_clid, "ctwa-b");
  assert.equal(new Set(results.flatMap((result) => result.results.map((item) => String(item?.eventId || "")))).size, 1);
});

test("toque atrasado nao substitui o anuncio mais recente e nao cruza tenants", async () => {
  await adminDb.collection("ad_creative_snapshots").doc(`ad_${suffix}`).set({ tenantId, adId: "latest-ad", campaignId: "campaign-confirmed", campaignName: "Campanha confirmada", dateRef: "2026-10-13" });
  const input = {
    tenantId, leadId, channel: "whatsapp", sourceType: "whatsapp_inbound", sourceLabel: "Meta",
    campaign: { adId: "latest-ad", clickId: "latest-click", source: "meta" }, occurredAtMs: Date.now() + 100,
  };
  await applyInboundCampaignAttribution(input);
  assert.equal((await applyInboundCampaignAttribution({ ...input, campaign: { adId: "old-ad" }, occurredAtMs: 1 })).applied, false);
  assert.equal((await adminDb.collection("leads").doc(leadId).get()).data()?.adId, "latest-ad");
  assert.equal((await adminDb.collection("leads").doc(leadId).get()).data()?.campaignId, "campaign-confirmed");
  await assert.rejects(() => applyInboundCampaignAttribution({ ...input, tenantId: "another-tenant" }), /fora do tenant/);
});

test("force nao reenvia conversao confirmada e falha esgotada vai para dead letter", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(JSON.stringify({ error: { message: "temporario" } }), { status: 503 }); };
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: "origin", force: true });
  assert.equal(calls, 0);
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: "exhausted" });
  const snap = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  const ref = snap.docs.find((doc) => doc.data().conversionKey === "exhausted")!.ref;
  await ref.set({ attempts: 7, nextAttemptAt: new Date(1) }, { merge: true });
  await processConversionDispatchJobs({ jobIds: [ref.id] });
  assert.equal((await ref.get()).data()?.status, "dead_letter");
});

test("falha fica duravel, reprocessa com o mesmo event_id e recupera lease vencido", async () => {
  let calls = 0;
  const eventIds: string[] = [];
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    const payload = JSON.parse(String(init?.body || "{}")) as { data: Array<{ event_id: string }> };
    eventIds.push(payload.data[0].event_id);
    if (calls === 1) return new Response(JSON.stringify({ error: { message: "temporario" } }), { status: 503 });
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  };
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: "retryable", force: true });
  const snap = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  const job = snap.docs.find((doc) => doc.data().conversionKey === "retryable")!;
  assert.equal(job.data().status, "retry");
  await job.ref.set({ status: "processing", leaseUntil: new Date(Date.now() - 60_000), nextAttemptAt: new Date(Date.now() - 60_000) }, { merge: true });
  await processConversionDispatchJobs({ jobIds: [job.id] });
  const recovered = (await job.ref.get()).data()!;
  assert.equal(recovered.status, "processed");
  assert.equal(recovered.attempts, 2);
  assert.deepEqual(eventIds, [job.id, job.id]);
});

test("venda conserva valor, data e anuncio original entre falha e recuperacao do worker", async () => {
  await adminDb.collection("leads").doc(leadId).set({ pipelineStage: "ganho", potentialValue: 1234.5 }, { merge: true });
  const requests: Array<{ data: Array<Record<string, unknown>> }> = [];
  const urls: string[] = [];
  globalThis.fetch = async (url, init) => {
    urls.push(String(url));
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify(requests.length === 1 ? { error: { message: "indisponivel" } } : { events_received: 1 }), { status: requests.length === 1 ? 503 : 200 });
  };
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "sale_won", conversionKey: "order-1", conversionValue: 987.65, occurredAt: "2026-10-13T12:00:00Z" });
  const jobs = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  const ref = jobs.docs.find((doc) => doc.data().conversionKey === "order-1")!.ref;
  await ref.set({ nextAttemptAt: new Date(1) }, { merge: true });
  await adminDb.collection("tenant_channels").doc(channelId).set({ metadata: { pixelId: "another-pixel", testEventCode: "NEW_TEST_CODE" } }, { merge: true });
  await adminDb.collection("leads").doc(leadId).set({ potentialValue: 9999, adId: "changed-after-sale" }, { merge: true });
  await processConversionDispatchJobs({ tenantId });
  assert.equal((await ref.get()).data()?.status, "processed");
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(urls[0], urls[1]);
  assert.equal((requests[1].data[0].custom_data as Record<string, unknown>).value, 987.65);
  await adminDb.collection("tenant_channels").doc(channelId).set({ metadata: { pixelId: "pixel-test", testEventCode: "" } }, { merge: true });
});

test("Google HTTP 200 com erro parcial nao e declarado como conversao confirmada", async () => {
  const googleId = `google_${suffix}`;
  await adminDb.collection("tenant_channels").doc(googleId).set({ tenantId, type: "google_ads", externalAccountId: "123", accessToken: "test-token", metadata: { leadConversionActionId: "456" } });
  await adminDb.collection("leads").doc(leadId).set({ gclid: "click-google" }, { merge: true });
  globalThis.fetch = async (url) => new Response(JSON.stringify(String(url).includes("googleads")
    ? { partialFailureError: { code: 3, message: "Conversion action invalida" } }
    : { events_received: 1 }), { status: 200 });
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: "google-partial" });
  const jobs = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  const google = jobs.docs.find((doc) => doc.data().provider === "google" && doc.data().conversionKey === "google-partial")!;
  assert.equal(google.data().status, "retry");
  assert.match(google.data().error, /Conversion action invalida/);
  await adminDb.collection("tenant_channels").doc(googleId).delete();
});

test("identidades longas nao colidem e uma resposta sem recibo nao confirma o envio", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: `${"a".repeat(200)}-one` });
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: `${"a".repeat(200)}-two` });
  const jobs = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  const related = jobs.docs.filter((doc) => String(doc.data().conversionKey).startsWith("a".repeat(200)));
  assert.equal(related.length, 2);
  assert.notEqual(related[0].id, related[1].id);
  assert.ok(related.every((doc) => doc.data().status === "retry"));
});

test("worker antigo nao sobrescreve o resultado de um novo dono do lease", async () => {
  let entered!: () => void;
  let release!: () => void;
  const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
  const releasePromise = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async () => { entered(); await releasePromise; throw new Error("falha do worker antigo"); };
  const running = dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: "lease-fencing" });
  await enteredPromise;
  const jobs = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  const ref = jobs.docs.find((doc) => doc.data().conversionKey === "lease-fencing")!.ref;
  await ref.set({ status: "processed", leaseToken: "new-worker", processedAt: new Date() }, { merge: true });
  release();
  await running;
  assert.equal((await ref.get()).data()?.status, "processed");
  assert.equal((await ref.get()).data()?.leaseToken, "new-worker");
});

test("worker escopado nao processa IDs de outro tenant", async () => {
  const ref = adminDb.collection("conversion_dispatches").doc(`scope_${suffix}`);
  await ref.set({ tenantId, status: "pending", attempts: 0, nextAttemptAt: new Date(1) });
  const result = await processConversionDispatchJobs({ tenantId: "another-tenant", jobIds: [ref.id] });
  assert.equal(result.processed, 0);
  assert.equal((await ref.get()).data()?.attempts, 0);
  assert.equal((await ref.get()).data()?.status, "pending");
});

test("configuracao de Page ID pode ser reparada sem perder o evento pendente", async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ events_received: 1 }), { status: 200 }); };
  await adminDb.collection("tenant_channels").doc(channelId).set({ metadata: { pageId: "" } }, { merge: true });
  await dispatchLeadConversionEvents({ tenantId, leadId, reason: "lead_created", conversionKey: "page-repaired" });
  assert.equal(calls, 0);
  const jobs = await adminDb.collection("conversion_dispatches").where("tenantId", "==", tenantId).get();
  const ref = jobs.docs.find((doc) => doc.data().conversionKey === "page-repaired")!.ref;
  assert.equal((await ref.get()).data()?.status, "retry");
  await adminDb.collection("tenant_channels").doc(channelId).set({ metadata: { pageId: "page-test" } }, { merge: true });
  await ref.set({ nextAttemptAt: new Date(1) }, { merge: true });
  await processConversionDispatchJobs({ tenantId, jobIds: [ref.id] });
  assert.equal(calls, 1);
  assert.equal((await ref.get()).data()?.status, "processed");
});
