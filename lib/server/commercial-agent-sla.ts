import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { sendCriticalPushToTenantUser } from "@/app/lib/server/client-portal-push";
import {
  evaluateCommercialAgentSla,
  normalizeCommercialAgentActionType,
  resolveCommercialAgentDeadlines,
  type CommercialAgentActionStatus,
} from "@/lib/commercial-agent-action";

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function managerCanReview(data: Record<string, unknown>) {
  if (clean(data.status, 40).toLowerCase() === "blocked") return false;
  const role = clean(data.role, 60).toLowerCase();
  if (["client_owner", "client_admin", "agency_owner", "agency_admin", "agency_agent"].includes(role)) return true;
  const capabilities = Array.isArray(data.capabilities)
    ? data.capabilities.map((item) => clean(item, 80).toLowerCase())
    : [];
  return capabilities.some((capability) => ["manage_commercial", "view_team_records", "manage_users"].includes(capability));
}

async function listManagerIds(tenantId: string) {
  const snap = await adminDb.collection("tenant_users").where("tenantId", "==", tenantId).limit(100).get();
  return Array.from(new Set(snap.docs
    .filter((doc) => managerCanReview(doc.data() as Record<string, unknown>))
    .map((doc) => clean(doc.data().userId, 180))
    .filter(Boolean)));
}

async function notifyManagers(input: {
  actionId: string;
  tenantId: string;
  title: string;
  detail: string;
  level: number;
  expired: boolean;
}) {
  const notificationRef = adminDb.collection("ai_internal_notifications").doc(`commercial_action_${input.actionId}`);
  const current = await notificationRef.get();
  await notificationRef.set({
    tenantId: input.tenantId,
    type: "commercial_action_sla",
    category: "commercial",
    status: "open",
    severity: input.expired ? "high" : input.level >= 2 ? "high" : "medium",
    title: input.expired ? "Decisao comercial expirou" : "Decisao comercial fora do prazo",
    detail: input.detail || input.title,
    actionId: input.actionId,
    escalationLevel: input.level,
    href: "/cliente/painel/ia?section=decisions",
    lastOccurredAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: current.exists ? current.data()?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  }, { merge: true });

  const managerIds = await listManagerIds(input.tenantId);
  await Promise.allSettled(managerIds.map((uid) => sendCriticalPushToTenantUser({
    tenantId: input.tenantId,
    uid,
    title: input.expired ? "Decisao comercial expirou" : "Decisao comercial precisa de voce",
    body: input.detail || input.title,
    tag: `commercial-action-${input.actionId}`,
    url: "/cliente/painel/ia?section=decisions",
    ttl: 60 * 60 * 12,
  })));
  return managerIds.length;
}

async function expireLinkedObject(actionId: string, action: Record<string, unknown>) {
  const tenantId = clean(action.tenantId, 180);
  const leadId = clean(action.leadId, 180);
  const referenceId = clean(action.referenceId, 180);
  const referenceCollection = clean(action.referenceCollection, 80);
  const type = clean(action.type, 60);
  const writes: Promise<unknown>[] = [];

  if (type === "review_appointment" && referenceId) {
    const ref = adminDb.collection("appointments").doc(referenceId);
    const snap = await ref.get();
    if (snap.exists && clean(snap.data()?.tenantId, 180) === tenantId && clean(snap.data()?.status, 40) === "draft") {
      writes.push(ref.set({ status: "canceled", cancelReason: "ai_suggestion_expired", updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    }
  }
  if (["review_proposal", "review_charge"].includes(type) && referenceCollection === "orcamentos" && referenceId) {
    const ref = adminDb.collection("orcamentos").doc(referenceId);
    const snap = await ref.get();
    if (snap.exists && clean(snap.data()?.tenantId, 180) === tenantId) {
      const field = type === "review_charge" ? "chargeApprovalStatus" : "agentReviewStatus";
      writes.push(ref.set({ [field]: "expired", [`${field}At`]: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true }));
    }
  }
  if (leadId) {
    writes.push(adminDb.collection("leads").doc(leadId).collection("events").doc(`agent_action_expired_${actionId}`).set({
      type: "commercial_agent_action_expired",
      title: "Sugestao da IA expirou sem decisao",
      detail: clean(action.title, 180),
      actionId,
      actorId: "commercial_agent_sla",
      actorName: "Controle comercial Altum",
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true }));
  }
  await Promise.all(writes);
}

export async function processCommercialAgentSla(input: { now?: number; limit?: number; tenantId?: string } = {}) {
  const now = input.now ?? Date.now();
  const limit = Math.max(1, Math.min(500, Number(input.limit) || 200));
  const tenantId = clean(input.tenantId, 180);
  const baseQuery = tenantId
    ? adminDb.collection("commercial_agent_actions").where("tenantId", "==", tenantId).where("status", "==", "pending_approval")
    : adminDb.collection("commercial_agent_actions").where("status", "==", "pending_approval");
  const snap = await baseQuery.orderBy("createdAt", "asc").limit(limit).get();
  const results: Array<Record<string, unknown>> = [];
  let backfilled = 0;
  let escalated = 0;
  let expired = 0;

  for (const doc of snap.docs) {
    const action = doc.data() as Record<string, unknown>;
    const type = normalizeCommercialAgentActionType(action.type);
    const tenantId = clean(action.tenantId, 180);
    if (!type || !tenantId) {
      results.push({ actionId: doc.id, skipped: "invalid_action" });
      continue;
    }
    const deadlines = resolveCommercialAgentDeadlines(type, action.createdAt);
    const dueAt = action.dueAt || deadlines.dueAt;
    const expiresAt = action.expiresAt || deadlines.expiresAt;
    if ((!action.dueAt && dueAt) || (!action.expiresAt && expiresAt)) {
      await doc.ref.set({ dueAt, expiresAt, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      backfilled += 1;
    }
    const evaluation = evaluateCommercialAgentSla({
      type,
      status: clean(action.status, 40) as CommercialAgentActionStatus,
      createdAt: action.createdAt,
      dueAt,
      expiresAt,
      escalationLevel: action.escalationLevel,
      now,
    });
    if (evaluation.state === "expired") {
      const changed = await adminDb.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        if (!current.exists || clean(current.data()?.status, 40) !== "pending_approval") return false;
        tx.set(doc.ref, {
          status: "expired",
          expiredAt: new Date(now),
          expirationReason: "approval_window_elapsed",
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
      });
      if (!changed) continue;
      await expireLinkedObject(doc.id, action);
      const notifiedManagers = await notifyManagers({ actionId: doc.id, tenantId, title: clean(action.title, 180), detail: clean(action.detail, 500), level: Math.max(2, evaluation.escalationLevel), expired: true });
      expired += 1;
      results.push({ actionId: doc.id, state: "expired", notifiedManagers });
      continue;
    }
    if (evaluation.state === "escalate") {
      const changed = await adminDb.runTransaction(async (tx) => {
        const current = await tx.get(doc.ref);
        const currentLevel = Number(current.data()?.escalationLevel) || 0;
        if (!current.exists || clean(current.data()?.status, 40) !== "pending_approval" || currentLevel >= evaluation.escalationLevel) return false;
        tx.set(doc.ref, {
          escalationLevel: evaluation.escalationLevel,
          escalatedAt: new Date(now),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return true;
      });
      if (!changed) continue;
      const notifiedManagers = await notifyManagers({ actionId: doc.id, tenantId, title: clean(action.title, 180), detail: clean(action.detail, 500), level: evaluation.escalationLevel, expired: false });
      escalated += 1;
      results.push({ actionId: doc.id, state: "escalated", level: evaluation.escalationLevel, notifiedManagers });
    }
  }

  return { scanned: snap.size, changed: escalated + expired, escalated, expired, backfilled, results };
}
