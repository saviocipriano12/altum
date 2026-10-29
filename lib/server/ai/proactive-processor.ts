import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { generateAiProactiveRecommendation } from "@/lib/ai-proactive-intelligence";
import { persistAiProactiveRecommendation } from "@/lib/server/ai/proactive-store";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

function clean(value: unknown, max = 180) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : ""; }
function millis(value: unknown) {
  if (typeof value === "number") return value;
  if (value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function") return value.toMillis();
  return 0;
}
function object(value: unknown) { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }

export function isAiProactiveQuietHours(input: { nowMs: number; timeZone?: string | null; startHour?: number; endHour?: number }) {
  const timeZone = clean(input.timeZone, 80) || "America/Sao_Paulo";
  let hour = 12;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(input.nowMs)));
  } catch {
    hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", hourCycle: "h23" }).format(new Date(input.nowMs)));
  }
  const start = Math.max(0, Math.min(23, Number(input.startHour ?? 20)));
  const end = Math.max(0, Math.min(23, Number(input.endHour ?? 8)));
  return start === end ? false : start < end ? hour >= start && hour < end : hour >= start || hour < end;
}

export async function evaluateAndPersistLeadProactivity(input: {
  tenantId: string;
  leadId: string;
  createdBy: string;
  nowMs?: number;
  quietHours?: boolean;
}) {
  const tenantId = clean(input.tenantId);
  const leadId = clean(input.leadId);
  const now = input.nowMs || Date.now();
  const [leadDoc, tasks, openRecommendations] = await Promise.all([
    adminDb.collection("leads").doc(leadId).get(),
    adminDb.collection("lead_tasks").where("tenantId", "==", tenantId).where("leadId", "==", leadId).limit(100).get(),
    adminDb.collection("ai_proactive_recommendations").where("tenantId", "==", tenantId).where("leadId", "==", leadId).limit(20).get(),
  ]);
  if (!leadDoc.exists || leadDoc.data()?.tenantId !== tenantId) return { status: "skipped" as const, reason: "lead_scope_invalid" as const, recommendation: null };
  const lead = leadDoc.data() as Record<string, unknown>;
  const custom = object(lead.customFields);
  const consent = object(lead.consent);
  const recommendation = generateAiProactiveRecommendation({
    tenantId, leadId, nowMs: now,
    stage: clean(lead.stage || lead.stageName), leadStatus: clean(lead.status), score: Number(lead.score || lead.qualificationScore || 0),
    lastInteractionAtMs: millis(lead.lastInteractionAt || lead.lastMessageAt || lead.updatedAt), nextAction: clean(lead.aiNextAction),
    pendingHandoff: lead.handoffRequested === true || clean(lead.handoffStatus) === "pending",
    overdueTasks: tasks.docs.filter((doc) => clean(doc.data().status) === "pending" && millis(doc.data().dueAt) > 0 && millis(doc.data().dueAt) < now).length,
    proposalPending: ["pending", "sent", "aguardando"].includes(clean(lead.proposalStatus)),
    appointmentAtMs: millis(lead.appointmentAt || lead.nextAppointmentAt), unresolvedIncident: lead.unresolvedIncident === true,
    consentAllowed: consent.whatsapp === false || custom.consent_whatsapp === false ? false : null,
    doNotContact: lead.doNotContact === true || custom.do_not_contact === true,
    recentOutboundCount72h: Number(lead.recentOutboundCount72h || 0),
    openRecommendationCount: openRecommendations.docs.filter((doc) => clean(doc.data().status) === "suggested" && millis(doc.data().expiresAt) > now).length,
    quietHours: input.quietHours === true,
  });
  if (!recommendation) return { status: "skipped" as const, reason: "no_relevant_signal" as const, recommendation: null };
  const persisted = await persistAiProactiveRecommendation(recommendation, input.createdBy);
  return { status: persisted.status, reason: null, recommendation: { id: persisted.id, ...recommendation } };
}

export async function scanAiProactiveRecommendations(input?: { tenantLimit?: number; leadLimit?: number; nowMs?: number }) {
  const nowMs = input?.nowMs || Date.now();
  const tenantLimit = Math.max(1, Math.min(200, input?.tenantLimit || 20));
  const leadLimit = Math.max(1, Math.min(100, input?.leadLimit || 40));
  const globalCursorRef = adminDb.collection("ai_proactive_scan_cursors").doc("tenants");
  const globalCursor = await globalCursorRef.get();
  const lastTenantId = clean(globalCursor.data()?.lastId);
  let settingsQuery = adminDb.collection("tenant_settings").orderBy(FieldPath.documentId()).limit(tenantLimit);
  if (lastTenantId) settingsQuery = settingsQuery.startAfter(lastTenantId);
  let settingsSnap = await settingsQuery.get();
  if (settingsSnap.empty && lastTenantId) settingsSnap = await adminDb.collection("tenant_settings").orderBy(FieldPath.documentId()).limit(tenantLimit).get();
  const counters = { tenantsScanned: 0, tenantsEnabled: 0, leadsScanned: 0, created: 0, duplicate: 0, suppressed: 0, skipped: 0, failed: 0 };
  for (const settingsDoc of settingsSnap.docs) {
    counters.tenantsScanned += 1;
    const settings = settingsDoc.data() as Record<string, unknown>;
    const ai = object(settings.ai);
    if (ai.enabled === false || ai.proactiveEnabled === false) continue;
    const tenantId = clean(settings.tenantId) || settingsDoc.id;
    try {
      await assertTenantModule(tenantId, "ai");
    } catch {
      continue;
    }
    counters.tenantsEnabled += 1;
    const businessHours = object(settings.businessHours);
    const quietHours = isAiProactiveQuietHours({
      nowMs,
      timeZone: clean(settings.timezone || businessHours.timezone) || "America/Sao_Paulo",
      startHour: Number(ai.proactiveQuietStartHour ?? 20),
      endHour: Number(ai.proactiveQuietEndHour ?? 8),
    });
    const leadCursorRef = adminDb.collection("ai_proactive_scan_cursors").doc(`leads_${tenantId}`);
    const leadCursor = await leadCursorRef.get();
    const lastLeadId = clean(leadCursor.data()?.lastId);
    let leadQuery = adminDb.collection("leads").where("tenantId", "==", tenantId).orderBy(FieldPath.documentId()).limit(leadLimit);
    if (lastLeadId) leadQuery = leadQuery.startAfter(lastLeadId);
    let leads = await leadQuery.get();
    if (leads.empty && lastLeadId) leads = await adminDb.collection("leads").where("tenantId", "==", tenantId).orderBy(FieldPath.documentId()).limit(leadLimit).get();
    for (const lead of leads.docs) {
      counters.leadsScanned += 1;
      try {
        const result = await evaluateAndPersistLeadProactivity({ tenantId, leadId: lead.id, createdBy: "ai_proactive_job", nowMs, quietHours });
        if (result.status === "created") {
          counters.created += 1;
          if (result.recommendation?.status === "suppressed") counters.suppressed += 1;
        } else if (result.status === "duplicate") counters.duplicate += 1;
        else counters.skipped += 1;
      } catch {
        counters.failed += 1;
      }
    }
    if (!leads.empty) await leadCursorRef.set({ tenantId, lastId: leads.docs.at(-1)?.id || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (!settingsSnap.empty) await globalCursorRef.set({ lastId: settingsSnap.docs.at(-1)?.id || null, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const receipt = await adminDb.collection("ai_proactive_scan_runs").add({
    schemaVersion: "ai-proactive-scan-v1",
    ...counters,
    externalEffects: 0,
    createdAt: FieldValue.serverTimestamp(),
  });
  return { runId: receipt.id, ...counters, externalEffects: 0 };
}
