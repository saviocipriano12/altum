import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

type Actor = { uid: string; name: string };

/** A mention of a result is never consent. The user must use an affirmative
 * phrase before the conversation can spend credits or make an external change. */
export function isExplicitApprovalMessage(message: string) {
  const normalized = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (/\b(nao|nunca|recusar|cancele|cancelar|rejeit)/.test(normalized)) return false;
  return /\b(pode\s+(?:gerar|fazer|seguir|prosseguir|executar|publicar|rodar)|aprova(?:r|do)?|confirmo|autorizo|pode\s+ir|manda\s+ver|vamos\s+nessa)\b/.test(normalized);
}

export type ConversationApprovalResult =
  | { found: false }
  | { found: true; kind: "media" | "landing" | "avatar" | "action"; title: string };

/** Approves only the newest pending action belonging to this exact chat. A
 * media job becomes auto-startable; the durable worker performs the paid call
 * once, rather than this request creating a duplicate render. */
export async function approveLatestConversationAction(input: { tenantId: string; conversationId: string; actor: Actor }): Promise<ConversationApprovalResult> {
  const approvals = await adminDb.collection("agent_approvals").where("tenantId", "==", input.tenantId).limit(200).get();
  const pending = approvals.docs.filter((doc) => doc.get("status") === "pending" && typeof doc.get("missionId") === "string" && doc.get("missionId"));
  if (!pending.length) return { found: false };
  const missionIds = [...new Set(pending.map((doc) => String(doc.get("missionId"))))].slice(0, 80);
  const missions = await Promise.all(missionIds.map((id) => adminDb.collection("agent_missions").doc(id).get()));
  const allowedMissionIds = new Set(missions.filter((doc) => doc.exists && doc.get("conversationId") === input.conversationId).map((doc) => doc.id));
  const ref = pending.filter((doc) => allowedMissionIds.has(String(doc.get("missionId")))).sort((left, right) => (right.get("createdAt")?.toMillis?.() || 0) - (left.get("createdAt")?.toMillis?.() || 0))[0];
  if (!ref) return { found: false };

  let kind: "media" | "landing" | "avatar" | "action" = "action";
  let title = "esta ação";
  let applied = false;
  await adminDb.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref.ref);
    if (!snap.exists || snap.get("status") !== "pending") return;
    const data = snap.data()!;
    applied = true;
    title = String(data.title || title);
    if (typeof data.creativeJobId === "string" && data.creativeJobId) kind = "media";
    else if (typeof data.captureFormId === "string" && data.captureFormId) kind = "landing";
    else if (typeof data.avatarJobId === "string" && data.avatarJobId) kind = "avatar";
    transaction.set(ref.ref, { status: "approved", decisionNote: "Autorização explícita registrada na conversa.", decidedBy: input.actor.uid, decidedByName: input.actor.name, decidedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (typeof data.missionId === "string" && data.missionId) transaction.set(adminDb.collection("agent_missions").doc(data.missionId), { status: "running", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (typeof data.taskId === "string" && data.taskId) transaction.set(adminDb.collection("agent_tasks").doc(data.taskId), { status: "ready", updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (typeof data.creativeJobId === "string" && data.creativeJobId) transaction.set(adminDb.collection("creative_jobs").doc(data.creativeJobId), { status: "queued", autoStart: true, approvedBy: input.actor.uid, approvedByName: input.actor.name, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (typeof data.avatarJobId === "string" && data.avatarJobId) transaction.set(adminDb.collection("avatar_jobs").doc(data.avatarJobId), { status: "approved_for_anchor", approvedBy: input.actor.uid, approvedByName: input.actor.name, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    if (typeof data.captureFormId === "string" && data.captureFormId) transaction.set(adminDb.collection("capture_forms").doc(data.captureFormId), { status: "active", publishedAt: FieldValue.serverTimestamp(), publishedBy: input.actor.uid, updatedAt: FieldValue.serverTimestamp(), updatedBy: input.actor.uid, updatedByName: input.actor.name }, { merge: true });
    transaction.set(adminDb.collection("audit_logs").doc(), { type: "agent_approval_approved_from_conversation", actorId: input.actor.uid, actorName: input.actor.name, tenantId: input.tenantId, missionId: data.missionId || null, approvalId: ref.id, actionType: data.actionType || null, createdAt: FieldValue.serverTimestamp() });
  });
  if (!applied) return { found: false };
  return { found: true, kind, title };
}
