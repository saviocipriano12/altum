import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { executeCreativeJobWithFallback, refreshCreativeJob } from "@/lib/server/agent-os/creative-executor";
import { loadCreativeExecutionCandidates } from "@/lib/server/agent-os/creative-execution-routing";
import { persistCreativeAsset } from "@/lib/server/agent-os/creative-asset-storage";
import { assessCreativeAsset } from "@/lib/server/agent-os/creative-quality";
import { queueIdentityVideoContinuation, reportCreativeCompletion } from "@/lib/server/agent-os/creative-job-worker";
import { recordCreativeConnectionAttempts } from "@/lib/server/agent-os/creative-connection-health";

function failure(error: unknown) {
  if (error instanceof RouteAuthError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Falha no executor criativo:", error);
  return Response.json({ error: "Não foi possível executar o job de mídia." }, { status: 500 });
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const actor = await requireRequestUser(request, { roles: ["agency_admin"] });
    const { jobId } = await context.params;
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(jobId)) throw new RouteAuthError(400, "job_invalid", "Job de mídia inválido.");
    const jobRef = adminDb.collection("creative_jobs").doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) throw new RouteAuthError(404, "job_missing", "Job de mídia não encontrado.");
    const job = jobSnap.data()!;
    const body = await request.json().catch(() => ({})) as { action?: unknown };
    const refresh = body.action === "refresh";
    if (!refresh && job.status !== "queued") throw new RouteAuthError(409, "job_not_ready", "A geração precisa estar aprovada e na fila antes de executar.");
    if (refresh && job.status !== "submitted") throw new RouteAuthError(409, "job_not_submitted", "Este job ainda não está aguardando resultado do provider.");
    const candidates = await loadCreativeExecutionCandidates(job);
    if (!candidates.length) throw new RouteAuthError(409, "connection_not_ready", "Nenhuma conexão compatível está pronta para executar esta geração.");
    // An earlier fallback may have submitted the job through a different
    // provider. Poll that exact connection, never the original first choice.
    const refreshCandidate = refresh ? candidates.find((item) => item.id === job.connectionId) : null;
    if (refresh && !refreshCandidate) throw new RouteAuthError(409, "provider_connection_missing", "A conexão usada nesta geração não está mais disponível.");
    const primaryConnection = refreshCandidate?.connection || candidates[0].connection;

    if (refresh) {
      // The background worker uses this same lease. A manual refresh must
      // respect it instead of racing to persist the same provider result.
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(jobRef);
        const lockedUntil = current.get("pollLockUntil");
        const leaseExpires = typeof lockedUntil?.toMillis === "function" ? lockedUntil.toMillis() : 0;
        if (!current.exists || current.get("status") !== "submitted" || leaseExpires > Date.now()) {
          throw new RouteAuthError(409, "job_refresh_busy", "Outra consulta deste resultado já está em andamento.");
        }
        transaction.set(jobRef, { pollLockUntil: new Date(Date.now() + 90_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      });
    }
    if (!refresh) {
      // Claim atomically before the paid provider request. Two concurrent
      // clicks must never submit the same creative job twice.
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(jobRef);
        if (!current.exists || current.get("status") !== "queued") {
          throw new RouteAuthError(409, "job_already_claimed", "Esta geração já foi iniciada por outro executor.");
        }
        transaction.set(jobRef, {
          status: "running", startedAt: FieldValue.serverTimestamp(),
          startedBy: actor.uid, updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      });
    }
    try {
      const routed = refresh ? null : await executeCreativeJobWithFallback({
        job: { id: jobId, capability: String(job.capability || ""), format: String(job.format || "image"), prompt: String(job.prompt || ""), tenantId: String(job.tenantId || ""), projectId: String(job.projectId || ""), outputId: String(job.outputId || ""), creativeModel: job.creativeModel, identityReferenceId: job.identityReferenceId, sourceImageStoragePath: job.sourceImageStoragePath },
        candidates,
      });
      const result = refresh ? await refreshCreativeJob(primaryConnection, job.providerStatusUrl) : routed!;
      if (routed) await recordCreativeConnectionAttempts(routed.attempts);
      // The job itself is the stable identity of one rendered asset. Reusing it
      // prevents a provider refresh from creating duplicate cards in Results.
      const assetRef = result.assetUrl ? adminDb.collection("creative_assets").doc(jobId) : null;
      const asset = result.assetUrl
        ? await persistCreativeAsset({ sourceUrl: result.assetUrl, tenantId: String(job.tenantId || ""), jobId, type: String(job.format || "image") }).catch((storageError) => {
          console.error("Não foi possível persistir o resultado criativo:", storageError);
          return { sourceUrl: result.assetUrl!, storagePath: null, contentType: null, size: null, persistence: "external" as const };
        })
        : null;
      const batch = adminDb.batch();
      batch.set(jobRef, { status: result.status, providerJobId: result.providerJobId, providerStatusUrl: result.providerStatusUrl, assetUrl: result.assetUrl, connectionId: routed?.connectionId || job.connectionId, providerId: routed?.providerId || job.providerId, executionAttempts: routed?.attempts || null, pollAttempts: refresh ? FieldValue.increment(1) : 0, pollLockUntil: null, nextPollAt: result.status === "submitted" ? new Date(Date.now() + 15_000) : null, completedAt: result.status === "completed" ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (assetRef && asset) batch.set(assetRef, { tenantId: job.tenantId, projectId: job.projectId, outputId: job.outputId, creativeJobId: jobId, type: job.format, url: asset.sourceUrl, sourceUrl: asset.sourceUrl, storagePath: asset.storagePath, contentType: asset.contentType, size: asset.size, persistence: asset.persistence, qualityPreflight: assessCreativeAsset({ type: String(job.format || "image"), persistence: asset.persistence, contentType: asset.contentType, size: asset.size, identityProfileId: job.identityProfileId }), reviewStatus: "pending", providerId: job.providerId || null, createdBy: actor.uid, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      batch.set(adminDb.collection("audit_logs").doc(), { type: "creative_media_job_executed", actorId: actor.uid, actorName: actor.name, tenantId: job.tenantId || null, creativeJobId: jobId, providerId: job.providerId || null, status: result.status, createdAt: FieldValue.serverTimestamp() });
      await batch.commit();
      if (result.status === "completed") {
        await queueIdentityVideoContinuation({ parent: job, parentJobId: jobId, storagePath: asset?.storagePath || null });
        await reportCreativeCompletion({ job, jobId, type: String(job.format || "image") }).catch(() => undefined);
      }
      return Response.json({ ok: true, status: result.status, assetUrl: result.assetUrl, providerJobId: result.providerJobId });
    } catch (error) {
      const attempts = (error as { attempts?: unknown }).attempts;
      if (Array.isArray(attempts)) await recordCreativeConnectionAttempts(attempts).catch(() => undefined);
      if (refresh) {
        // A temporary provider status outage does not mean the paid render failed.
        // Release the lease and let the regular worker retry later.
        await jobRef.set({ pollLockUntil: null, nextPollAt: new Date(Date.now() + 30_000), lastPollError: error instanceof Error ? error.message.slice(0, 500) : "media_poll_failed", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      } else {
        await jobRef.set({ status: "failed", failureReason: error instanceof Error ? error.message.slice(0, 1000) : "Falha desconhecida", failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
      throw error;
    }
  } catch (error) { return failure(error); }
}
