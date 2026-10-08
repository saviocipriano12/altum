import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { createHiggsfieldSoulReference, getHiggsfieldSoulReference } from "@/lib/server/agent-os/higgsfield-avatar";
import { creativePollDelayMs } from "@/lib/server/agent-os/creative-job-worker";

function millis(value: unknown) { return value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function" ? (value as { toDate: () => Date }).toDate().getTime() : 0; }

async function reportAnchorUpdate(input: { job: Record<string, unknown>; content: string; status: "completed" | "failed" }) {
  const missionId = typeof input.job.missionId === "string" ? input.job.missionId : "";
  if (!missionId) return;
  const missionRef = adminDb.collection("agent_missions").doc(missionId);
  const mission = await missionRef.get();
  if (!mission.exists) return;
  const ownerId = typeof mission.get("createdBy") === "string" ? mission.get("createdBy") : "";
  const tenantId = typeof mission.get("tenantId") === "string" ? mission.get("tenantId") : "";
  const conversationId = typeof mission.get("conversationId") === "string" ? mission.get("conversationId") : "";
  if (!ownerId || !tenantId || !conversationId) return;
  const batch = adminDb.batch();
  batch.set(adminDb.collection("agent_command_messages").doc(), { ownerId, tenantId, conversationId, role: "assistant", missionId, content: input.content, createdAt: FieldValue.serverTimestamp() });
  batch.set(missionRef, { status: input.status === "completed" ? "completed" : "failed", progress: input.status === "completed" ? 100 : 0, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
}

export async function processAvatarAnchorJobs(input?: { limit?: number }) {
  const limit = Math.max(1, Math.min(16, Number(input?.limit || 6)));
  const now = Date.now();
  const jobs = await adminDb.collection("avatar_jobs").where("stage", "==", "anchor").limit(100).get();
  const candidates = jobs.docs.filter((job) => ["approved_for_anchor", "submitted"].includes(String(job.get("status") || "")) && millis(job.get("nextPollAt")) <= now && millis(job.get("lockUntil")) <= now).slice(0, limit);
  const results: Array<{ jobId: string; status: string; error?: string }> = [];
  for (const jobDoc of candidates) {
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(jobDoc.ref);
      if (!fresh.exists || !["approved_for_anchor", "submitted"].includes(String(fresh.get("status") || "")) || millis(fresh.get("nextPollAt")) > Date.now() || millis(fresh.get("lockUntil")) > Date.now()) return null;
      transaction.set(jobDoc.ref, { lockUntil: new Date(Date.now() + 120_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return fresh.data()!;
    });
    if (!claimed) continue;
    try {
      const connection = await adminDb.collection("tool_connections").doc(String(claimed.connectionId || "")).get();
      if (!connection.exists || String(connection.get("providerId") || "") !== "higgsfield") throw new Error("avatar_provider_adapter_unavailable");
      const profileRef = adminDb.collection("avatar_profiles").doc(String(claimed.avatarId || ""));
      const profile = await profileRef.get();
      if (!profile.exists) throw new Error("avatar_profile_missing");
      const attempts = Number(claimed.pollAttempts || 0) + 1;
      if (claimed.status === "approved_for_anchor") {
        const refs = await profileRef.collection("references").where("kind", "==", "visual").limit(20).get();
        const created = await createHiggsfieldSoulReference({ connection: connection.data()!, name: String(profile.get("displayName") || "Altum identity"), references: refs.docs.map((ref) => ({ storagePath: String(ref.get("storagePath") || ""), kind: String(ref.get("kind") || "") })) });
        await jobDoc.ref.set({ status: "submitted", providerReferenceId: created.referenceId, providerReferenceStatus: created.status, pollAttempts: attempts, lockUntil: null, nextPollAt: new Date(Date.now() + creativePollDelayMs(0)), submittedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        results.push({ jobId: jobDoc.id, status: "submitted" });
      } else {
        const reference = await getHiggsfieldSoulReference({ connection: connection.data()!, referenceId: String(claimed.providerReferenceId || "") });
        if (reference.failed) throw new Error("higgsfield_anchor_training_failed");
        if (!reference.ready) {
          await jobDoc.ref.set({ providerReferenceStatus: reference.status, pollAttempts: attempts, lockUntil: null, nextPollAt: new Date(Date.now() + creativePollDelayMs(attempts)), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          results.push({ jobId: jobDoc.id, status: "submitted" });
        } else {
          const batch = adminDb.batch();
          batch.set(jobDoc.ref, { status: "completed", providerReferenceStatus: reference.status, lockUntil: null, nextPollAt: null, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          batch.set(profileRef, { status: "anchored", anchorProviderId: "higgsfield", anchorReferenceId: claimed.providerReferenceId, anchorVersion: "soul-v2-visual", anchorThumbnailUrl: reference.thumbnailUrl, voiceCloneStatus: "not_configured", anchoredAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          batch.set(adminDb.collection("audit_logs").doc(), { type: "avatar_anchor_completed", tenantId: claimed.tenantId || null, avatarId: claimed.avatarId || null, avatarJobId: jobDoc.id, providerId: "higgsfield", createdAt: FieldValue.serverTimestamp() });
          await batch.commit();
          await reportAnchorUpdate({ job: claimed, status: "completed", content: `A âncora visual privada de “${String(profile.get("displayName") || "seu avatar")}” está pronta. Vou usar essa identidade visual de forma consistente nos próximos criativos autorizados. A amostra de voz continua privada; a clonagem de voz só será ativada quando houver um adaptador de voz validado e uma autorização específica.` }).catch(() => undefined);
          results.push({ jobId: jobDoc.id, status: "completed" });
        }
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 1000) : "avatar_anchor_failed";
      await jobDoc.ref.set({ status: "failed", lockUntil: null, nextPollAt: null, failureReason: reason, failedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      await reportAnchorUpdate({ job: claimed, status: "failed", content: "A criação da âncora não foi concluída. Suas referências continuam privadas e nada foi publicado. Posso revisar as referências ou tentar novamente quando a conexão estiver disponível." }).catch(() => undefined);
      results.push({ jobId: jobDoc.id, status: "failed", error: reason });
    }
  }
  return { processed: results.length, results };
}
