import { FieldValue } from "firebase-admin/firestore";
import {prepareAppointmentReservation} from "@/lib/server/crm/appointment-mutation";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { sendCriticalPushToTenantUser } from "@/app/lib/server/client-portal-push";
import {
  evaluateCommercialAgentSla,
  normalizeCommercialAgentActionType,
  resolveCommercialAgentDeadlines,
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

/** Evaluate the observed revision and commit the decision with its linked draft.
 * Changed candidates are left for the next scan; stale scans never backfill or expire them. */
export async function applyCommercialAgentSla(expected: FirebaseFirestore.DocumentSnapshot, now: number) {
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(expected.ref), action = snapshot.data();
    if (!action || !snapshot.createTime?.isEqual(expected.createTime!) || !snapshot.updateTime?.isEqual(expected.updateTime!)) return null;
    const tenantId = clean(action.tenantId, 180), leadId = clean(action.leadId, 180);
    const type = normalizeCommercialAgentActionType(action.type);
    const safeId = (value: string) => Boolean(value && !value.includes("/") && value.length <= 180);
    if (!type || !safeId(tenantId) || !safeId(leadId) || action.status !== "pending_approval") return null;
    const lead = await tx.get(adminDb.collection("leads").doc(leadId));
    if (!lead.exists || lead.data()?.tenantId !== tenantId) return null;
    const generation = action.sourceLeadGeneration;
    if (generation && (typeof generation.isEqual !== "function" || !generation.isEqual(lead.createTime))) return null;
    const deadlines = resolveCommercialAgentDeadlines(type, action.createdAt);
    const dueAt = action.dueAt || deadlines.dueAt, expiresAt = action.expiresAt || deadlines.expiresAt;
    const evaluation = evaluateCommercialAgentSla({type, status: "pending_approval", createdAt: action.createdAt,
      dueAt, expiresAt, escalationLevel: action.escalationLevel, now});
    const backfilled = Boolean(!action.dueAt && dueAt || !action.expiresAt && expiresAt);
    const patch: Record<string, unknown> = backfilled ? {dueAt, expiresAt} : {};
    let linked: FirebaseFirestore.DocumentSnapshot | null = null;
    let linkedPatch: Record<string, unknown> | null = null;
    let reserve: (() => unknown) | null = null;
    if (evaluation.state === "expired") {
      const referenceId = clean(action.referenceId, 180), collection = clean(action.referenceCollection, 80);
      if (type === "review_appointment" && collection === "appointments" && safeId(referenceId)) {
        linked = await tx.get(adminDb.collection(collection).doc(referenceId));
        const row = linked.data();
        if (row?.tenantId === tenantId && row.leadId === leadId && row.status === "draft" &&
          (!row.reviewActionId || row.reviewActionId === snapshot.id) &&
          (!row.sourceLeadGeneration || typeof row.sourceLeadGeneration.isEqual === "function" && row.sourceLeadGeneration.isEqual(lead.createTime))) {
          reserve = await prepareAppointmentReservation(tx, {tenantId, appointmentId: referenceId, status: "canceled",
            startAt: null, endAt: null, leadId, ownerUserId: row.ownerUserId || null});
          linkedPatch = {status: "canceled", cancelReason: "ai_suggestion_expired", version: Number(row.version || 0) + 1};
        }
      } else if (["review_proposal", "review_charge"].includes(type) && collection === "orcamentos" && safeId(referenceId)) {
        linked = await tx.get(adminDb.collection(collection).doc(referenceId));
        const row = linked.data(), field = type === "review_charge" ? "chargeApprovalStatus" : "agentReviewStatus";
        if (row?.tenantId === tenantId && row.leadId === leadId && (!row.reviewActionId || row.reviewActionId === snapshot.id) &&
          (!row.sourceLeadGeneration || typeof row.sourceLeadGeneration.isEqual === "function" && row.sourceLeadGeneration.isEqual(lead.createTime)) &&
          (!row[field] || row[field] === "pending_approval") && (type !== "review_proposal" || row.status === "Rascunho")) {
          linkedPatch = {[field]: "expired", [`${field}At`]: FieldValue.serverTimestamp()};
        }
      }
      Object.assign(patch, {status: "expired", expiredAt: new Date(now), expirationReason: "approval_window_elapsed"});
    } else if (evaluation.state === "escalate") {
      Object.assign(patch, {escalationLevel: evaluation.escalationLevel, escalatedAt: new Date(now)});
    }
    if (Object.keys(patch).length) tx.update(snapshot.ref, {...patch, updatedAt: FieldValue.serverTimestamp()});
    if (linked && linkedPatch) tx.update(linked.ref, {...linkedPatch, updatedAt: FieldValue.serverTimestamp()});
    reserve?.();
    if (evaluation.state === "expired") tx.create(lead.ref.collection("events").doc(`agent_action_expired_${snapshot.id}`), {
      tenantId, type: "commercial_agent_action_expired", title: "Sugestao da IA expirou sem decisao", detail: clean(action.title, 180),
      actionId: snapshot.id, actorId: "commercial_agent_sla", actorName: "Controle comercial Altum", createdAt: FieldValue.serverTimestamp(),
    });
    return {tenantId, title: clean(action.title, 180), detail: clean(action.detail, 500), backfilled,
      state: evaluation.state, level: evaluation.escalationLevel};
  });
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
    const change = await applyCommercialAgentSla(doc, now);
    if (!change) {results.push({actionId: doc.id, skipped: "changed_or_invalid_context"}); continue;}
    if (change.backfilled) backfilled += 1;
    if (change.state !== "expired" && change.state !== "escalate") continue;
    const isExpired = change.state === "expired";
    const notifiedManagers = await notifyManagers({actionId: doc.id, tenantId: change.tenantId, title: change.title,
      detail: change.detail, level: isExpired ? Math.max(2, change.level) : change.level, expired: isExpired});
    if (isExpired) expired += 1; else escalated += 1;
    results.push({actionId: doc.id, state: change.state, level: change.level, notifiedManagers});
  }

  return { scanned: snap.size, changed: escalated + expired, escalated, expired, backfilled, results };
}
