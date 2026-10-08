import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { executeCreativeJobWithFallback, refreshCreativeJob } from "@/lib/server/agent-os/creative-executor";
import { loadCreativeExecutionCandidates } from "@/lib/server/agent-os/creative-execution-routing";
import { persistCreativeAsset } from "@/lib/server/agent-os/creative-asset-storage";
import { assessCreativeAsset } from "@/lib/server/agent-os/creative-quality";
import { recordCreativeConnectionAttempts } from "@/lib/server/agent-os/creative-connection-health";

import { creativePollDelayMs } from "@/lib/server/agent-os/creative-poll-delay";
export { creativePollDelayMs } from "@/lib/server/agent-os/creative-poll-delay";

function millis(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") return (value as { toDate: () => Date }).toDate().getTime();
  return 0;
}

export async function reportCreativeCompletion(input: { job: Record<string, unknown>; jobId: string; type: string }) {
  // The image used only as an internal bridge for an identity video is not a
  // user-facing delivery. The final video is the message that matters.
  if (input.job.pipeline && input.type !== "video") return;
  const projectId = typeof input.job.projectId === "string" ? input.job.projectId : "";
  if (!projectId) return;
  const project = await adminDb.collection("creative_projects").doc(projectId).get();
  if (!project.exists) return;
  const missionId = typeof project.get("missionId") === "string" ? project.get("missionId") : "";
  if (!missionId) return;
  const mission = await adminDb.collection("agent_missions").doc(missionId).get();
  const ownerId = mission.exists && typeof mission.get("createdBy") === "string" ? mission.get("createdBy") : "";
  const tenantId = mission.exists && typeof mission.get("tenantId") === "string" ? mission.get("tenantId") : "";
  const conversationId = mission.exists && typeof mission.get("conversationId") === "string" ? mission.get("conversationId") : "";
  if (!ownerId || !tenantId || !conversationId) return;
  await adminDb.collection("agent_command_messages").add({ ownerId, tenantId, conversationId, missionId, role: "assistant", content: `Seu ${input.type === "video" ? "vídeo" : "resultado visual"} ficou pronto para revisão. Ele está disponível abaixo e também na Central de Resultados; aprove se quiser reutilizá-lo em uma campanha.`, creativeJobId: input.jobId, createdAt: FieldValue.serverTimestamp() });
}

export async function queueIdentityVideoContinuation(input: { parent: Record<string, unknown>; parentJobId: string; storagePath: string | null }) {
  const pipeline = input.parent.pipeline;
  if (!pipeline || typeof pipeline !== "object" || (pipeline as Record<string, unknown>).kind !== "identity_image_to_video") return;
  const parentRef = adminDb.collection("creative_jobs").doc(input.parentJobId);
  if (!input.storagePath) {
    await parentRef.set({ pipelineStatus: "blocked", pipelineFailureReason: "A imagem-base não pôde ser guardada com segurança para a etapa de vídeo.", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return;
  }
  const childRef = adminDb.collection("creative_jobs").doc();
  await adminDb.runTransaction(async (transaction) => {
    const fresh = await transaction.get(parentRef);
    if (!fresh.exists || fresh.get("pipelineChildJobId")) return;
    transaction.set(childRef, {
      tenantId: fresh.get("tenantId"), projectId: fresh.get("projectId"), outputId: fresh.get("outputId"),
      providerId: fresh.get("providerId"), providerName: fresh.get("providerName"), connectionId: fresh.get("connectionId"),
      capability: "GENERATE_VIDEO", format: "video", prompt: fresh.get("prompt"), creativeModel: "bytedance/seedance-2.5/image-to-video",
      identityProfileId: fresh.get("identityProfileId") || null, identityReferenceId: fresh.get("identityReferenceId") || null,
      sourceImageStoragePath: input.storagePath, parentJobId: input.parentJobId, autoStart: true, status: "queued",
      routingReason: "Vídeo criado a partir da imagem-base aprovada da identidade.", createdBy: "creative_media_worker", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(parentRef, { pipelineChildJobId: childRef.id, pipelineStatus: "video_queued", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

/** Starts only child jobs produced by an already-approved pipeline. Regular
 * creative jobs still require the explicit user action that exists today. */
/** Starts an already-approved paid render. The caller can target the just
 * approved job so no browser tab has to stay open to begin the work. */
export async function processAutomaticCreativeContinuations(input: { limit?: number; jobId?: string } = {}) {
  const limit = Math.max(1, Math.min(40, Number(input.limit || 12)));
  const queued = await adminDb.collection("creative_jobs").where("status", "==", "queued").limit(160).get();
  const candidates = queued.docs.filter((item) => item.get("autoStart") === true && (!input.jobId || item.id === input.jobId)).slice(0, limit);
  const results: Array<{ jobId: string; status: "completed" | "submitted" | "failed"; error?: string }> = [];
  for (const item of candidates) {
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(item.ref);
      if (!fresh.exists || fresh.get("status") !== "queued" || fresh.get("autoStart") !== true) return null;
      transaction.set(item.ref, { status: "running", startedAt: FieldValue.serverTimestamp(), startedBy: "creative_media_worker", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return fresh.data()!;
    });
    if (!claimed) continue;
    try {
      const candidates = await loadCreativeExecutionCandidates(claimed);
      if (!candidates.length) throw new Error("connection_missing");
      const result = await executeCreativeJobWithFallback({ job: { id: item.id, capability: String(claimed.capability || "GENERATE_VIDEO"), format: String(claimed.format || "video"), prompt: String(claimed.prompt || ""), tenantId: String(claimed.tenantId || ""), projectId: String(claimed.projectId || ""), outputId: String(claimed.outputId || ""), creativeModel: claimed.creativeModel, identityReferenceId: claimed.identityReferenceId, sourceImageStoragePath: claimed.sourceImageStoragePath }, candidates });
      await recordCreativeConnectionAttempts(result.attempts);
      const asset = result.assetUrl ? await persistCreativeAsset({ sourceUrl: result.assetUrl, tenantId: String(claimed.tenantId || ""), jobId: item.id, type: "video" }).catch(() => ({ sourceUrl: result.assetUrl!, storagePath: null, contentType: null, size: null, persistence: "external" as const })) : null;
      const batch = adminDb.batch();
      batch.set(item.ref, { status: result.status, providerJobId: result.providerJobId, providerStatusUrl: result.providerStatusUrl, assetUrl: result.assetUrl, connectionId: result.connectionId, providerId: result.providerId, executionAttempts: result.attempts, pollAttempts: 0, pollLockUntil: null, nextPollAt: result.status === "submitted" ? new Date(Date.now() + 15_000) : null, completedAt: result.status === "completed" ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (asset && result.assetUrl) batch.set(adminDb.collection("creative_assets").doc(item.id), { tenantId: claimed.tenantId, projectId: claimed.projectId, outputId: claimed.outputId, creativeJobId: item.id, type: "video", url: asset.sourceUrl, sourceUrl: asset.sourceUrl, storagePath: asset.storagePath, contentType: asset.contentType, size: asset.size, persistence: asset.persistence, qualityPreflight: assessCreativeAsset({ type: "video", persistence: asset.persistence, contentType: asset.contentType, size: asset.size, identityProfileId: claimed.identityProfileId }), reviewStatus: "pending", providerId: claimed.providerId || null, createdBy: "creative_media_worker", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await batch.commit();
      if (result.status === "completed") await reportCreativeCompletion({ job: claimed, jobId: item.id, type: "video" }).catch(() => undefined);
      results.push({ jobId: item.id, status: result.status });
    } catch (error) {
      const attempts = (error as { attempts?: unknown }).attempts;
      if (Array.isArray(attempts)) await recordCreativeConnectionAttempts(attempts).catch(() => undefined);
      const reason = error instanceof Error ? error.message.slice(0, 1000) : "creative_continuation_failed";
      await item.ref.set({ status: "failed", failureReason: reason, failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      results.push({ jobId: item.id, status: "failed", error: reason });
    }
  }
  return results;
}

/**
 * Polls only jobs which were already approved and submitted. The lock is kept
 * in Firestore so a browser refresh, cron and future queue worker cannot all
 * poll the same paid generation concurrently.
 */
export async function processCreativeMediaJobs(input?: { limit?: number }) {
  const limit = Math.max(1, Math.min(40, Number(input?.limit || 12)));
  const now = Date.now();
  const pending = await adminDb.collection("creative_jobs").where("status", "==", "submitted").limit(160).get();
  const candidates = pending.docs.filter((doc) => millis(doc.get("nextPollAt")) <= now && millis(doc.get("pollLockUntil")) <= now).slice(0, limit);
  const results: Array<{ jobId: string; status: "completed" | "submitted" | "failed"; error?: string }> = [];

  for (const item of candidates) {
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(item.ref);
      if (!fresh.exists || fresh.get("status") !== "submitted" || millis(fresh.get("nextPollAt")) > Date.now() || millis(fresh.get("pollLockUntil")) > Date.now()) return null;
      transaction.set(item.ref, { pollLockUntil: new Date(Date.now() + 90_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return fresh.data()!;
    });
    if (!claimed) continue;

    const jobId = item.id;
    try {
      const connection = await adminDb.collection("tool_connections").doc(String(claimed.connectionId || "")).get();
      if (!connection.exists) throw new Error("connection_missing");
      const result = await refreshCreativeJob(connection.data()!, claimed.providerStatusUrl);
      const asset = result.assetUrl
        ? await persistCreativeAsset({ sourceUrl: result.assetUrl, tenantId: String(claimed.tenantId || ""), jobId, type: String(claimed.format || "image") }).catch(() => ({ sourceUrl: result.assetUrl!, storagePath: null, contentType: null, size: null, persistence: "external" as const }))
        : null;
      const attempts = Number(claimed.pollAttempts || 0) + 1;
      const nextPollAt = result.status === "submitted" ? new Date(Date.now() + creativePollDelayMs(attempts)) : null;
      const batch = adminDb.batch();
      batch.set(item.ref, {
        status: result.status, providerJobId: result.providerJobId || claimed.providerJobId || null, providerStatusUrl: result.providerStatusUrl || claimed.providerStatusUrl || null,
        assetUrl: result.assetUrl || null, pollAttempts: attempts, pollLockUntil: null, nextPollAt,
        completedAt: result.status === "completed" ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      if (asset && result.assetUrl) batch.set(adminDb.collection("creative_assets").doc(jobId), {
        tenantId: claimed.tenantId, projectId: claimed.projectId, outputId: claimed.outputId, creativeJobId: jobId, type: claimed.format,
        url: asset.sourceUrl, sourceUrl: asset.sourceUrl, storagePath: asset.storagePath, contentType: asset.contentType, size: asset.size, persistence: asset.persistence,
        qualityPreflight: assessCreativeAsset({ type: String(claimed.format || "image"), persistence: asset.persistence, contentType: asset.contentType, size: asset.size, identityProfileId: claimed.identityProfileId }), reviewStatus: "pending", providerId: claimed.providerId || null, createdBy: "creative_media_worker", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      batch.set(adminDb.collection("audit_logs").doc(), { type: "creative_media_job_polled", tenantId: claimed.tenantId || null, creativeJobId: jobId, providerId: claimed.providerId || null, status: result.status, createdAt: FieldValue.serverTimestamp() });
      await batch.commit();
      if (result.status === "completed") {
        await queueIdentityVideoContinuation({ parent: claimed, parentJobId: jobId, storagePath: asset?.storagePath || null });
        await reportCreativeCompletion({ job: claimed, jobId, type: String(claimed.format || "image") }).catch(() => undefined);
      }
      results.push({ jobId, status: result.status });
    } catch (error) {
      const attempts = Number(claimed.pollAttempts || 0) + 1;
      const terminal = attempts >= 8;
      const reason = error instanceof Error ? error.message.slice(0, 1000) : "creative_poll_failed";
      await item.ref.set({ status: terminal ? "failed" : "submitted", pollAttempts: attempts, pollLockUntil: null, nextPollAt: terminal ? null : new Date(Date.now() + creativePollDelayMs(attempts)), failureReason: terminal ? reason : null, failedAt: terminal ? FieldValue.serverTimestamp() : null, lastPollError: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      results.push({ jobId, status: terminal ? "failed" : "submitted", error: reason });
    }
  }
  const continuations = await processAutomaticCreativeContinuations({ limit });
  return { processed: results.length + continuations.length, results: [...results, ...continuations] };
}
