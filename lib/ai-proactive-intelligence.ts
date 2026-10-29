import { createHash } from "node:crypto";

export const AI_PROACTIVE_INTELLIGENCE_VERSION = "ai-proactive-intelligence-v1" as const;

export type AiProactiveCandidate = {
  tenantId: string;
  leadId: string;
  nowMs: number;
  stage?: string | null;
  leadStatus?: string | null;
  score?: number | null;
  lastInteractionAtMs?: number | null;
  nextAction?: string | null;
  pendingHandoff?: boolean;
  overdueTasks?: number;
  proposalPending?: boolean;
  appointmentAtMs?: number | null;
  unresolvedIncident?: boolean;
  consentAllowed?: boolean | null;
  doNotContact?: boolean;
  recentOutboundCount72h?: number;
  openRecommendationCount?: number;
  quietHours?: boolean;
};

export type AiProactiveRecommendation = {
  schemaVersion: typeof AI_PROACTIVE_INTELLIGENCE_VERSION;
  tenantId: string;
  leadId: string;
  kind: "human_takeover" | "overdue_commitment" | "appointment_risk" | "proposal_followup" | "hot_lead_recovery" | "retention_recovery";
  status: "suggested" | "suppressed";
  priority: "urgent" | "high" | "medium";
  score: number;
  actionMode: "human_review";
  suggestedAction: "review_handoff" | "review_task" | "confirm_appointment" | "review_proposal" | "create_follow_up" | "resolve_incident";
  reasons: string[];
  suppressions: string[];
  evidence: Array<{ key: string; value: string | number | boolean }>;
  dueAtMs: number;
  expiresAtMs: number;
  fingerprint: string;
  rollback: string;
};

export type AiProactiveLifecycleStatus = "suggested" | "suppressed" | "accepted" | "dismissed" | "completed";

export function resolveAiProactiveTransition(current: AiProactiveLifecycleStatus, action: "accept" | "dismiss" | "complete") {
  const allowed =
    (current === "suggested" && (action === "accept" || action === "dismiss")) ||
    (current === "accepted" && (action === "complete" || action === "dismiss")) ||
    (current === "suppressed" && action === "dismiss");
  return {
    allowed,
    nextStatus: allowed ? (action === "accept" ? "accepted" : action === "dismiss" ? "dismissed" : "completed") as AiProactiveLifecycleStatus : current,
  };
}

function normalized(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 120);
}

function hoursSince(nowMs: number, value?: number | null) {
  return value && value <= nowMs ? Math.max(0, (nowMs - value) / 3_600_000) : 0;
}

export function generateAiProactiveRecommendation(input: AiProactiveCandidate): AiProactiveRecommendation | null {
  const tenantId = normalized(input.tenantId);
  const leadId = normalized(input.leadId);
  if (!tenantId || !leadId || !Number.isFinite(input.nowMs)) return null;
  const inactivityHours = hoursSince(input.nowMs, input.lastInteractionAtMs);
  const stage = normalized(input.stage);
  const status = normalized(input.leadStatus);
  if (["won", "lost", "closed", "cancelled", "ganho", "perdido"].includes(status)) return null;

  let kind: AiProactiveRecommendation["kind"] | null = null;
  let priority: AiProactiveRecommendation["priority"] = "medium";
  let score = 0;
  let suggestedAction: AiProactiveRecommendation["suggestedAction"] = "create_follow_up";
  const reasons: string[] = [];
  const evidence: AiProactiveRecommendation["evidence"] = [];

  if (input.pendingHandoff) {
    kind = "human_takeover"; priority = "urgent"; score = 100; suggestedAction = "review_handoff";
    reasons.push("handoff_humano_pendente"); evidence.push({ key: "pending_handoff", value: true });
  } else if ((input.overdueTasks || 0) > 0) {
    kind = "overdue_commitment"; priority = "urgent"; score = 95; suggestedAction = "review_task";
    reasons.push("compromisso_vencido"); evidence.push({ key: "overdue_tasks", value: input.overdueTasks || 0 });
  } else if (input.unresolvedIncident) {
    kind = "retention_recovery"; priority = "urgent"; score = 92; suggestedAction = "resolve_incident";
    reasons.push("incidente_nao_resolvido"); evidence.push({ key: "unresolved_incident", value: true });
  } else if (input.appointmentAtMs && input.appointmentAtMs > input.nowMs && input.appointmentAtMs - input.nowMs <= 24 * 3_600_000) {
    kind = "appointment_risk"; priority = "high"; score = 86; suggestedAction = "confirm_appointment";
    reasons.push("agendamento_nas_proximas_24h"); evidence.push({ key: "hours_until_appointment", value: Math.round((input.appointmentAtMs - input.nowMs) / 3_600_000) });
  } else if (input.proposalPending && inactivityHours >= 24) {
    kind = "proposal_followup"; priority = "high"; score = 82; suggestedAction = "review_proposal";
    reasons.push("proposta_sem_retorno"); evidence.push({ key: "inactivity_hours", value: Math.round(inactivityHours) });
  } else if ((input.score || 0) >= 70 && inactivityHours >= 24) {
    kind = "hot_lead_recovery"; priority = "high"; score = Math.min(90, 70 + Math.round(inactivityHours / 12)); suggestedAction = "create_follow_up";
    reasons.push("lead_quente_sem_proximo_movimento"); evidence.push({ key: "lead_score", value: input.score || 0 }, { key: "inactivity_hours", value: Math.round(inactivityHours) });
  }
  if (!kind) return null;
  if (input.nextAction) evidence.push({ key: "next_action", value: normalized(input.nextAction) });
  if (stage) evidence.push({ key: "stage", value: stage });

  const suppressions: string[] = [];
  if (input.doNotContact) suppressions.push("do_not_contact");
  if (input.consentAllowed === false) suppressions.push("consent_denied");
  if ((input.recentOutboundCount72h || 0) >= 3) suppressions.push("contact_fatigue");
  if ((input.openRecommendationCount || 0) > 0) suppressions.push("open_recommendation_exists");
  if (input.quietHours) suppressions.push("quiet_hours");
  const statusValue = suppressions.length ? "suppressed" as const : "suggested" as const;
  const dueAtMs = input.nowMs + (priority === "urgent" ? 30 : priority === "high" ? 120 : 24 * 60) * 60_000;
  const expiresAtMs = input.nowMs + (priority === "urgent" ? 12 : 72) * 3_600_000;
  const identity = { version: AI_PROACTIVE_INTELLIGENCE_VERSION, tenantId, leadId, kind, reasons, evidence, suppressions, day: new Date(input.nowMs).toISOString().slice(0, 10) };
  return {
    schemaVersion: AI_PROACTIVE_INTELLIGENCE_VERSION,
    tenantId, leadId, kind, status: statusValue, priority, score,
    actionMode: "human_review",
    suggestedAction,
    reasons,
    suppressions,
    evidence,
    dueAtMs,
    expiresAtMs,
    fingerprint: createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32),
    rollback: "Arquivar a recomendacao; nenhuma mensagem ou alteracao externa foi executada.",
  };
}

export function summarizeAiProactiveRecommendations(items: AiProactiveRecommendation[]) {
  const visible = items.filter((item) => item.status === "suggested").sort((a, b) => b.score - a.score || a.dueAtMs - b.dueAtMs);
  return {
    total: items.length,
    actionable: visible.length,
    suppressed: items.length - visible.length,
    urgent: visible.filter((item) => item.priority === "urgent").length,
    items: visible,
  };
}
