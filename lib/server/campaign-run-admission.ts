import { FieldValue, type Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { createChatOutboundFingerprint, normalizeChatOutboundRequestId, ChatOutboundIdempotencyError } from "./chat-outbound-idempotency";
import type { OutboundCampaignRecord } from "./outbound-campaigns";

export type CampaignRunPlan = {
  campaign: OutboundCampaignRecord; campaignVersion: Timestamp; queued: number;
  scheduledAt: string; summary: { sent: number; skipped: number; failed: number; totalMatched: number; selectedByLimit: number };
  jobs: Array<{ leadIds: string[]; dueAt: string }>;
};
const hash = (value: unknown) => createChatOutboundFingerprint([value]);
function validPlan(plan: CampaignRunPlan) {
  if (!plan || !Array.isArray(plan.jobs) || !plan.jobs.length || plan.jobs.length > 500 || !Number.isInteger(plan.queued) || plan.queued < 1 || plan.queued > 500) return false;
  const leads: string[] = [];
  for (const job of plan.jobs) {
    if (!Array.isArray(job.leadIds) || !job.leadIds.length || job.leadIds.length > 120 ||
      job.leadIds.some(id => typeof id !== "string" || !id || id.length > 180 || id.trim() !== id || id.includes("/")) ||
      typeof job.dueAt !== "string" || Number.isNaN(new Date(job.dueAt).getTime())) return false;
    leads.push(...job.leadIds);
  }
  return leads.length === plan.queued && new Set(leads).size === plan.queued && !Number.isNaN(new Date(plan.scheduledAt).getTime());
}
async function settleChunk(operations: Promise<unknown>[]) {
  const results = await Promise.allSettled(operations);
  const failure = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failure) throw failure.reason;
}
export function campaignBatchMatchesPlan(jobId: string, job: Record<string, unknown>, run: Record<string, unknown>) {
  if (run.admissionProtocol !== 1) return true; // Legacy runs have no manifest.
  const plan = run.admissionPlan as CampaignRunPlan;
  const prefix = `${job.runId}_`, suffix = jobId.startsWith(prefix) ? jobId.slice(prefix.length) : "";
  if (!/^\d+$/.test(suffix) || !validPlan(plan) || hash(plan) !== run.admissionPlanHash || job.admissionPlanHash !== run.admissionPlanHash) return false;
  const expected = plan.jobs[Number(suffix)];
  const due = job.dueAt as { toMillis?: () => number } | undefined;
  return Boolean(expected && hash(job.leadIds) === hash(expected.leadIds) && job.plannedDueAt === expected.dueAt &&
    typeof due?.toMillis === "function" && due.toMillis() >= new Date(expected.dueAt).getTime());
}

/** Reserve first; deterministic create-only jobs and conditional activation allow safe replay. */
export async function admitCampaignRun(input: {
  tenantId: string; campaignId: string; actor: { id: string; name: string };
  clientRequestId?: string | null; scheduledAt?: Date | null; plan: () => Promise<CampaignRunPlan>;
}) {
  const requestId = normalizeChatOutboundRequestId(input.clientRequestId);
  const runId = `campaign_run_${hash(["campaign-run-v1", input.tenantId, input.campaignId, requestId])}`;
  const fingerprint = hash(["campaign-request-v1", input.tenantId, input.campaignId, input.actor.id, input.scheduledAt?.toISOString() || null]);
  const runRef = adminDb.collection("outbound_campaign_runs").doc(runId), campaignRef = adminDb.collection("outbound_campaigns").doc(input.campaignId);
  function accepted(data: Record<string, unknown> | undefined) {
    if (!data || data.tenantId !== input.tenantId || data.campaignId !== input.campaignId || data.requestFingerprint !== fingerprint || data.admissionProtocol !== 1) throw new ChatOutboundIdempotencyError();
    const plan = data.admissionPlan as CampaignRunPlan;
    if (!plan || plan.campaign?.tenantId !== input.tenantId || plan.campaign?.id !== input.campaignId || data.admissionPlanHash !== hash(plan) ||
      !validPlan(plan)) throw new Error("Plano de campanha aceito foi alterado. Revise antes de enviar.");
    return plan;
  }
  let existing = await runRef.get(), replayed = existing.exists;
  if (!existing.exists) {
    const proposed = await input.plan();
    if (proposed.campaign.tenantId !== input.tenantId || proposed.campaign.id !== input.campaignId || !validPlan(proposed) ||
      (input.scheduledAt && proposed.scheduledAt !== input.scheduledAt.toISOString())) throw new Error("Plano de disparo invalido.");
    await adminDb.runTransaction(async tx => {
      const [current, campaign] = await Promise.all([tx.get(runRef), tx.get(campaignRef)]);
      if (current.exists) { accepted(current.data()); replayed = true; return; }
      if (!campaign.exists || campaign.data()?.tenantId !== input.tenantId) throw new Error("Campanha fora do tenant informado.");
      const activeRunId = String(campaign.data()?.activeRunId || "");
      if (activeRunId) {
        const active = await tx.get(adminDb.collection("outbound_campaign_runs").doc(activeRunId));
        if (!active.exists || active.data()?.tenantId !== input.tenantId || active.data()?.campaignId !== input.campaignId || !["completed", "failed"].includes(String(active.data()?.status))) {
          throw new Error("Este disparo ja possui uma execucao em andamento. Confirme a execucao anterior.");
        }
        if (activeRunId === runId) throw new Error("Execucao vinculada foi removida. Nao sera recriada automaticamente.");
      }
      if (!campaign.updateTime?.isEqual(proposed.campaignVersion)) throw new Error("A campanha mudou durante a preparacao. Atualize antes de tentar novamente.");
      const scheduled = new Date(proposed.scheduledAt), status = scheduled.getTime() > Date.now() + 15_000 ? "scheduled" : "queued";
      tx.create(runRef, { tenantId: input.tenantId, campaignId: input.campaignId, campaignName: proposed.campaign.name,
        channel: "whatsapp", status, scheduledAt: scheduled, totalJobs: proposed.jobs.length, completedJobs: 0,
        summary: proposed.summary, errors: [], admissionProtocol: 1, requestFingerprint: fingerprint,
        clientRequestId: requestId,
        admissionPlan: proposed, admissionPlanHash: hash(proposed), activationComplete: false,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), createdBy: input.actor.id, createdByName: input.actor.name });
      tx.update(campaignRef, { status: "active", executionStatus: status, activeRunId: runId, scheduledAt: scheduled,
        lastRunSummary: proposed.summary, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actor.id, updatedByName: input.actor.name });
    });
    existing = await runRef.get();
  }
  const plan = accepted(existing.data());
  if (existing.data()?.activationComplete !== true) {
    const refs = plan.jobs.map((job, index) => ({ job, ref: adminDb.collection("outbound_campaign_jobs").doc(`${runId}_${index}`) }));
    // No message can be sent yet: every job is staging until the whole plan exists.
    for (let offset = 0; offset < refs.length; offset += 20) {
      await settleChunk(refs.slice(offset, offset + 20).map(async ({ job, ref }) => {
        const data = { tenantId: input.tenantId, campaignId: input.campaignId, campaignName: plan.campaign.name, runId,
          leadIds: job.leadIds, dueAt: new Date(job.dueAt), plannedDueAt: job.dueAt, admissionPlanHash: hash(plan), status: "staging", attempts: 0,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          createdBy: existing.data()?.createdBy, createdByName: existing.data()?.createdByName };
        try { await ref.create(data); }
        catch (error) {
          // Also resolves an accepted create whose acknowledgement was lost.
          const stored = await ref.get(), row = stored.data();
          if (!stored.exists) throw error;
          if (row?.tenantId !== input.tenantId || row?.campaignId !== input.campaignId || row?.runId !== runId ||
            row.admissionPlanHash !== hash(plan) || hash(row.leadIds) !== hash(job.leadIds) || row.plannedDueAt !== job.dueAt) throw new ChatOutboundIdempotencyError();
        }
      }));
    }
    for (let offset = 0; offset < refs.length; offset += 20) {
      await settleChunk(refs.slice(offset, offset + 20).map(({ ref }) => adminDb.runTransaction(async tx => {
        const [job, current, campaign] = await Promise.all([tx.get(ref), tx.get(runRef), tx.get(campaignRef)]);
        accepted(current.data());
        if (campaign.data()?.tenantId !== input.tenantId || !job.exists || job.data()?.tenantId !== input.tenantId || job.data()?.runId !== runId) throw new Error("Ativacao de campanha fora do tenant.");
        if (job.data()?.status === "staging") {
          if (campaign.data()?.activeRunId !== runId) throw new Error("Execucao ativa mudou antes de ativar o lote.");
          tx.update(ref, { status: campaign.data()?.status === "paused" ? "paused" : "ready", updatedAt: FieldValue.serverTimestamp() });
        }
      })));
    }
    await adminDb.runTransaction(async tx => {
      const current = await tx.get(runRef); accepted(current.data());
      tx.update(runRef, { activationComplete: true, updatedAt: FieldValue.serverTimestamp() });
    });
  }
  return { campaign: plan.campaign, runId, queued: plan.queued, jobs: plan.jobs.length, scheduledAt: plan.scheduledAt, summary: plan.summary, replayed };
}
