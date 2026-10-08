import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";

type Actor = { uid: string; name: string };
export type AssetReviewDecision = "approved" | "rejected";

export function parseCreativeReviewMessage(message: string): AssetReviewDecision | null {
  const text = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!/\b(resultado|video|imagem|criativo|render|asset|material)\b/.test(text)) return null;
  if (/\b(descartar|descarta|rejeitar|rejeita|recusar|recusa|nao\s+(?:quero|gostei|usar))\b/.test(text)) return "rejected";
  if (/\b(aprovar|aprova|manter|mantenha|usar|use|ficou\s+bom|gostei)\b/.test(text)) return "approved";
  return null;
}

/** Finds only an unrevised asset produced by a mission from this exact chat. */
export async function reviewLatestConversationAsset(input: { tenantId: string; conversationId: string; actor: Actor; decision: AssetReviewDecision }) {
  const assets = await adminDb.collection("creative_assets").where("tenantId", "==", input.tenantId).limit(160).get();
  const pending = assets.docs.filter((doc) => doc.get("reviewStatus") === "pending" && typeof doc.get("projectId") === "string" && doc.get("projectId"));
  if (!pending.length) return null;
  const projectIds = [...new Set(pending.map((doc) => String(doc.get("projectId"))))].slice(0, 100);
  const projects = await Promise.all(projectIds.map((id) => adminDb.collection("creative_projects").doc(id).get()));
  const missionIds = [...new Set(projects.filter((doc) => doc.exists && typeof doc.get("missionId") === "string" && doc.get("missionId")).map((doc) => String(doc.get("missionId"))))].slice(0, 100);
  const missions = await Promise.all(missionIds.map((id) => adminDb.collection("agent_missions").doc(id).get()));
  const eligibleMissions = new Set(missions.filter((doc) => doc.exists && doc.get("conversationId") === input.conversationId).map((doc) => doc.id));
  const projectMission = new Map(projects.filter((doc) => doc.exists).map((doc) => [doc.id, String(doc.get("missionId") || "")]));
  const asset = pending.filter((doc) => eligibleMissions.has(projectMission.get(String(doc.get("projectId"))) || "")).sort((left, right) => (right.get("createdAt")?.toMillis?.() || 0) - (left.get("createdAt")?.toMillis?.() || 0))[0];
  if (!asset) return null;
  let applied = false;
  await adminDb.runTransaction(async (transaction) => {
    const fresh = await transaction.get(asset.ref);
    if (!fresh.exists || fresh.get("reviewStatus") !== "pending") return;
    applied = true;
    transaction.set(asset.ref, { reviewStatus: input.decision, reviewNote: "Decisão registrada na conversa.", reviewedBy: input.actor.uid, reviewedByName: input.actor.name, reviewedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(adminDb.collection("audit_logs").doc(), { type: `creative_asset_${input.decision}_from_conversation`, actorId: input.actor.uid, actorName: input.actor.name, tenantId: input.tenantId, assetId: asset.id, creativeJobId: fresh.get("creativeJobId") || null, createdAt: FieldValue.serverTimestamp() });
  });
  return applied ? { assetId: asset.id, type: String(asset.get("type") || "mídia") } : null;
}
