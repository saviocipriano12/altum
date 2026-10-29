import test, { after, mock } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
Object.assign(process.env, { FIREBASE_PROJECT_ID: "demo-altum-qa-lab", NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-altum-qa-lab",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080", FIREBASE_SERVICE_ACCOUNT_KEY: "", GOOGLE_APPLICATION_CREDENTIALS: "" });
const { adminDb } = await import("../app/lib/server/firebase-admin.ts");
const { admitCampaignRun } = await import("../lib/server/campaign-run-admission.ts");
const { normalizeOutboundCampaign, enqueueOutboundCampaign, processOutboundCampaignJobs } = await import("../lib/server/outbound-campaigns.ts");
const tenantId = `qa_campaign_admission_${Date.now()}`;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname), "campaign admission must not invoke any provider");
  return originalFetch(url, options);
};
async function fixture(name: string, count = 2, immediate = false) {
  const campaignId = `${tenantId}_${name}`, ref = adminDb.collection("outbound_campaigns").doc(campaignId);
  await ref.set({ tenantId, name: "Campanha QA", channelId: "qa-channel", deliveryMode: "text", messageTemplate: "Mensagem QA", status: "draft", executionStatus: "idle", sendRatePerMinute: 1, maxRecipients: count });
  const snapshot = await ref.get(), campaign = normalizeOutboundCampaign({ id: campaignId, data: snapshot.data()! });
  const scheduledAt = new Date(Date.now() + (immediate ? -600000 : 3600000)).toISOString();
  const plan = { campaign, campaignVersion: snapshot.updateTime!, queued: count, scheduledAt,
    summary: { sent: 0, skipped: 0, failed: 0, totalMatched: count, selectedByLimit: count },
    jobs: Array.from({ length: count }, (_, index) => ({ leadIds: [`qa-lead-${index}`], dueAt: new Date(new Date(scheduledAt).getTime() + index * 60000).toISOString() })) };
  return { input: { tenantId, campaignId, actor: { id: "qa-manager", name: "Gestor QA" }, clientRequestId: `request-${name}-0001`, scheduledAt: new Date(scheduledAt), plan: async () => plan }, plan, ref };
}
async function jobsFor(runId: string) { return adminDb.collection("outbound_campaign_jobs").where("runId", "==", runId).get(); }
after(async () => {
  globalThis.fetch = originalFetch; mock.restoreAll();
  for (const collection of ["outbound_campaigns", "outbound_campaign_runs", "outbound_campaign_jobs", "leads"]) {
    const rows = await adminDb.collection(collection).where("tenantId", "==", tenantId).get();
    await Promise.all(rows.docs.map(row => row.ref.delete()));
  }
  await adminDb.terminate();
});

test("concurrent identical requests reserve one run and one immutable set of jobs", async () => {
  const { input } = await fixture("concurrent");
  const results = await Promise.all(Array.from({ length: 5 }, () => admitCampaignRun(input)));
  assert.equal(new Set(results.map(item => item.runId)).size, 1);
  const jobs = await jobsFor(results[0].runId); assert.equal(jobs.size, 2);
  assert.ok(jobs.docs.every(job => job.data().status === "ready"));
});

test("different concurrent request keys cannot reserve two active campaign runs", async () => {
  const { input } = await fixture("two-requests");
  const results = await Promise.allSettled([admitCampaignRun(input), admitCampaignRun({ ...input, clientRequestId: "other-request-0001" })]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const runs = await adminDb.collection("outbound_campaign_runs").where("tenantId", "==", tenantId).where("campaignId", "==", input.campaignId).get();
  assert.equal(runs.size, 1);
});

test("replay retains accepted audience, timing and content even after campaign edits", async () => {
  const { input, ref } = await fixture("frozen"); const first = await admitCampaignRun(input);
  await ref.update({ messageTemplate: "Outro texto" });
  const replay = await admitCampaignRun({ ...input, plan: async () => { assert.fail("replay must not rebuild audience/content"); } });
  assert.equal(replay.runId, first.runId); assert.equal(replay.campaign.messageTemplate, "Mensagem QA");
  await assert.rejects(admitCampaignRun({ ...input, scheduledAt: new Date(Date.now() + 7200000) }), /outro conteudo/);
});

test("lost reservation commit acknowledgement resumes preparation using the persisted plan", async () => {
  const { input } = await fixture("reservation-ack");
  const original = adminDb.runTransaction.bind(adminDb); let lost = false;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    const result = await original(callback);
    if (!lost) { lost = true; throw Object.assign(new Error("lost reservation acknowledgement"), { code: 14 }); }
    return result;
  }) as typeof adminDb.runTransaction);
  try { await assert.rejects(admitCampaignRun(input), /lost reservation/); } finally { hook.mock.restore(); }
  const result = await admitCampaignRun({ ...input, plan: async () => { assert.fail("plan already accepted"); } });
  assert.equal((await jobsFor(result.runId)).size, 2); assert.equal(result.replayed, true);
});

test("partial activation replay never resets processing/completed jobs or their retry times", async () => {
  const { input } = await fixture("activation");
  const original = adminDb.runTransaction.bind(adminDb); let number = 0;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    if (++number === 2) throw new Error("activation interrupted");
    return original(callback);
  }) as typeof adminDb.runTransaction);
  try { await assert.rejects(admitCampaignRun(input), /activation interrupted/); } finally { hook.mock.restore(); }
  const run = await adminDb.collection("outbound_campaign_runs").where("tenantId", "==", tenantId).where("campaignId", "==", input.campaignId).get();
  const jobs = await jobsFor(run.docs[0].id), ready = jobs.docs.find(job => job.data().status === "ready")!;
  assert.ok(ready); const retryDate = new Date(Date.now() + 900000);
  await ready.ref.update({ status: "completed", attempts: 3, dueAt: retryDate });
  const replay = await admitCampaignRun(input); assert.equal(replay.runId, run.docs[0].id);
  const preserved = (await ready.ref.get()).data()!;
  assert.equal(preserved.status, "completed"); assert.equal(preserved.attempts, 3); assert.equal(preserved.dueAt.toMillis(), retryDate.getTime());
  assert.equal((await jobsFor(replay.runId)).docs.filter(job => job.data().status === "ready").length, 1);
});

test("pause during preparation cannot be undone by replay", async () => {
  const { input, ref } = await fixture("paused");
  const original = adminDb.runTransaction.bind(adminDb); let number = 0;
  const hook = mock.method(adminDb, "runTransaction", (async (callback: (tx: FirebaseFirestore.Transaction) => Promise<unknown>) => {
    if (++number === 2) { await ref.update({ status: "paused" }); throw new Error("paused preparation"); }
    return original(callback);
  }) as typeof adminDb.runTransaction);
  try { await assert.rejects(admitCampaignRun(input), /paused preparation/); } finally { hook.mock.restore(); }
  const result = await admitCampaignRun(input);
  assert.ok((await jobsFor(result.runId)).docs.every(job => job.data().status === "paused"));
  assert.equal((await ref.get()).data()?.status, "paused");
});

test("campaign edited before reservation rejects stale audience without reserving jobs", async () => {
  const { input, ref } = await fixture("stale"); await ref.update({ messageTemplate: "Nova campanha" });
  await assert.rejects(admitCampaignRun(input), /mudou/);
  const runs = await adminDb.collection("outbound_campaign_runs").where("tenantId", "==", tenantId).where("campaignId", "==", input.campaignId).get(); assert.equal(runs.size, 0);
});

test("foreign campaign cannot be reserved and malformed keys never call the planner", async () => {
  const { input } = await fixture("scope");
  await assert.rejects(admitCampaignRun({ ...input, tenantId: "qa-foreign" }), /invalido|fora do tenant/);
  await assert.rejects(admitCampaignRun({ ...input, clientRequestId: "bad/key", plan: async () => { assert.fail("invalid key reached planner"); } }), /invalido/);
});

test("500 rate-one batches can be admitted without exceeding a Firestore batch limit", async () => {
  const { input } = await fixture("maximum", 500); const result = await admitCampaignRun(input);
  assert.equal(result.jobs, 500); assert.equal((await jobsFor(result.runId)).size, 500);
});

test("public enqueue uses the durable planner and a retry never needs a second audience scan", async () => {
  const { input, ref } = await fixture("integration", 1);
  await ref.update({ maxRecipients: 1 });
  await adminDb.collection("leads").doc(`${input.campaignId}_lead`).set({ tenantId, telefone: "5511000000080", nome: "QA", createdAt: new Date() });
  const first = await enqueueOutboundCampaign(input); const second = await enqueueOutboundCampaign(input);
  assert.equal(second.runId, first.runId); assert.equal(second.replayed, true);
});

test("empty campaign job cannot expand into a broadcast to all leads", async () => {
  const { input } = await fixture("empty-job");
  const ref = adminDb.collection("outbound_campaign_jobs").doc(`${input.campaignId}_invalid`);
  await ref.set({ tenantId, campaignId: input.campaignId, runId: "qa-run", leadIds: [], status: "ready", dueAt: new Date(0) });
  await processOutboundCampaignJobs({ tenantId, limit: 5 });
  assert.equal((await ref.get()).data()?.error, "invalid_campaign_recipients");
});

test("API and existing screen preserve a request key and do not redispatch on replay", async () => {
  const api = await readFile("app/api/tenant/[tenantId]/outbound-campaigns/[campaignId]/dispatch/route.ts", "utf8");
  const screen = await readFile("app/cliente/painel/disparos/page.tsx", "utf8");
  assert.match(api, /clientRequestId: body.clientRequestId/); assert.match(api, /&& !result.replayed/);
  assert.match(api, /runId: result.runId/);
  assert.match(screen, /getCampaignDispatchAttempt\(window.localStorage/); assert.match(screen, /clientRequestId: attempt.id/);
});

for (const corruption of ["manifest", "inactive", "foreign"] as const) test(`campaign worker refuses ${corruption} run before dispatch`, async () => {
  const { input, ref } = await fixture(`worker-${corruption}`, 1, true), result = await admitCampaignRun(input);
  const runRef = adminDb.collection("outbound_campaign_runs").doc(result.runId), jobs = await jobsFor(result.runId);
  if (corruption === "manifest") await jobs.docs[0].ref.update({ leadIds: ["not-in-the-accepted-audience"] });
  if (corruption === "inactive") await ref.update({ activeRunId: "qa-different-run" });
  if (corruption === "foreign") await runRef.update({ tenantId: "qa-other-tenant" });
  try {
    await processOutboundCampaignJobs({ tenantId, limit: 5 });
    const job = (await jobs.docs[0].ref.get()).data()!;
    assert.equal(job.error, corruption === "manifest" ? "campaign_manifest_mismatch" : "campaign_run_scope_or_activity_changed");
  } finally { if (corruption === "foreign") await runRef.update({ tenantId }); }
});

test("editing a job due time cannot send before the accepted schedule", async () => {
  const { input } = await fixture("early-send", 1), result = await admitCampaignRun(input), jobs = await jobsFor(result.runId);
  await jobs.docs[0].ref.update({ dueAt: new Date(0) });
  await processOutboundCampaignJobs({ tenantId, limit: 5 });
  assert.equal((await jobs.docs[0].ref.get()).data()?.error, "campaign_manifest_mismatch");
});

test("processing one requested run never wakes another campaign", async () => {
  const { input } = await fixture("worker-scope");
  const other = adminDb.collection("outbound_campaign_jobs").doc(`${input.campaignId}_other`);
  await other.set({ tenantId, campaignId: input.campaignId, runId: "qa-other-run", leadIds: [], status: "ready", dueAt: new Date(0) });
  await processOutboundCampaignJobs({ tenantId, runId: "qa-requested-run", limit: 5 });
  assert.equal((await other.get()).data()?.status, "ready");
  await other.update({ status: "failed" });
});

for (const lostAck of [false, true]) test(`staging create ${lostAck ? "lost acknowledgement" : "failure"} cannot duplicate or overwrite jobs`, async () => {
  const { input } = await fixture(`staging-${lostAck}`);
  const prototype = Object.getPrototypeOf(adminDb.collection("outbound_campaign_jobs").doc("qa-fixture"));
  const original = prototype.create as FirebaseFirestore.DocumentReference["create"]; let intercepted = false;
  const hook = mock.method(prototype, "create", async function (this: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) {
    if (this.path.startsWith("outbound_campaign_jobs/") && !intercepted) {
      intercepted = true;
      if (lostAck) await original.call(this, data);
      throw Object.assign(new Error("staging create interrupted"), { code: 14 });
    }
    return original.call(this, data);
  });
  try {
    if (lostAck) await admitCampaignRun(input);
    else await assert.rejects(admitCampaignRun(input), /staging create interrupted/);
  } finally { hook.mock.restore(); }
  assert.ok(intercepted);
  const result = await admitCampaignRun(input), jobs = await jobsFor(result.runId);
  assert.equal(jobs.size, 2); assert.ok(jobs.docs.every(job => job.data().status === "ready"));
});

test("run finalization waits for staging and paused batches before clearing the active run", async () => {
  const { input, ref } = await fixture("finalize", 3, true), result = await admitCampaignRun(input);
  const jobs = await jobsFor(result.runId), last = jobs.docs.find(job => job.id.endsWith("_2"))!;
  await last.ref.update({ status: "staging" });
  await processOutboundCampaignJobs({ tenantId, runId: result.runId, limit: 1 });
  const runRef = adminDb.collection("outbound_campaign_runs").doc(result.runId);
  assert.equal((await runRef.get()).data()?.status, "running");
  assert.equal((await ref.get()).data()?.activeRunId, result.runId);
  await last.ref.update({ status: "paused" });
  await processOutboundCampaignJobs({ tenantId, runId: result.runId, limit: 1 });
  assert.equal((await runRef.get()).data()?.status, "running");
  await last.ref.update({ status: "ready" });
  await processOutboundCampaignJobs({ tenantId, runId: result.runId, limit: 1 });
  assert.equal((await runRef.get()).data()?.status, "completed");
  assert.equal((await runRef.get()).data()?.completedJobs, 3);
  assert.equal((await ref.get()).data()?.activeRunId, null);
});
