import { createHash } from "node:crypto";

export const AI_LEARNING_POLICY_VERSION = "ai-learning-policy-v1" as const;
export const AI_TENANT_RECOMMENDATION_VERSION = "ai-tenant-recommendation-v1" as const;
export const AI_LEARNING_MIN_SAMPLE = 8;
export const AI_LEARNING_MIN_RELATIONSHIPS = 3;

export type AiLearningSignalType =
  | "explicit_feedback"
  | "human_edit"
  | "handoff"
  | "customer_reply"
  | "silence"
  | "conversion"
  | "loss"
  | "proposal_outcome"
  | "appointment_outcome"
  | "pipeline_outcome"
  | "agent_observation";
export type AiLearningSource = "customer" | "human_operator" | "business_outcome" | "agent" | "system";
export type AiLearningTargetKind = "offer" | "next_action" | "closing_motion" | "objection" | "channel" | "role" | "action_family";
export type AiLearningDirection = "positive" | "negative" | "neutral";

const FIXED_GLOBAL_TARGETS: Record<string, Set<string>> = {
  channel: new Set(["whatsapp", "instagram", "facebook", "site", "other"]),
  role: new Set(["receptionist", "sdr", "sales", "closer", "consultant", "support", "post_sales"]),
  action_family: new Set(["reply", "handoff", "follow_up", "proposal", "meeting", "checkout", "support_resolution"]),
};

const TYPE_WEIGHT: Record<AiLearningSignalType, number> = {
  explicit_feedback: 1,
  human_edit: 0.95,
  conversion: 1,
  loss: 0.95,
  proposal_outcome: 0.85,
  appointment_outcome: 0.85,
  pipeline_outcome: 0.75,
  customer_reply: 0.35,
  handoff: 0.4,
  silence: 0.15,
  agent_observation: 0,
};

function clean(value: unknown, max = 160) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

export function learningMetricKey(value: unknown) {
  return clean(value, 180)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

export function learningRelationshipKey(tenantId: string, relationshipId: unknown) {
  const value = clean(relationshipId, 200);
  return value ? createHash("sha256").update(`${tenantId}\u0000${value}`).digest("hex").slice(0, 24) : "";
}

export function detectLearningPoisoning(value: unknown) {
  const text = clean(value, 1200).toLowerCase();
  if (!text) return null;
  if (/(ignore|ignorem|desconsidere).{0,40}(instruc|regra|prompt|sistema)/i.test(text)) return "prompt_injection";
  if (/(system\s*prompt|developer\s*message|tool[_ -]?call|guardrail)/i.test(text)) return "internal_instruction_probe";
  if (/(.)\1{18,}/.test(text) || text.split(/\s+/).length > 220) return "spam_or_flood";
  return null;
}

export function classifyLearningSignal(input: {
  type: AiLearningSignalType;
  source: AiLearningSource;
  direction: AiLearningDirection;
  targetKind: AiLearningTargetKind;
  targetId: unknown;
  rawCandidate?: unknown;
  selfGenerated?: boolean;
}) {
  const targetId = learningMetricKey(input.targetId);
  const poisoningReason = detectLearningPoisoning(input.rawCandidate) || detectLearningPoisoning(input.targetId);
  const rejectedReason = !targetId
    ? "missing_target"
    : input.source === "agent" || input.selfGenerated === true || input.type === "agent_observation"
      ? "self_generated_signal"
      : poisoningReason;
  const baseWeight = TYPE_WEIGHT[input.type];
  const signedWeight = input.direction === "positive" ? baseWeight : input.direction === "negative" ? -baseWeight : 0;
  const globalEligible =
    !rejectedReason &&
    ["customer", "human_operator", "business_outcome"].includes(input.source) &&
    Boolean(FIXED_GLOBAL_TARGETS[input.targetKind]?.has(targetId));
  return {
    schemaVersion: AI_LEARNING_POLICY_VERSION,
    accepted: !rejectedReason,
    rejectedReason: rejectedReason || null,
    targetId,
    weight: rejectedReason ? 0 : signedWeight,
    globalEligible,
  };
}

export type AiLearningSignalEvidence = {
  signalId: string;
  targetKind: AiLearningTargetKind;
  targetId: string;
  direction: AiLearningDirection;
  weight: number;
  source: AiLearningSource;
  relationshipKey: string;
  observedAtMs: number;
  expiresAtMs: number;
  accepted: boolean;
};

export type AiTenantLearningRecommendation = {
  schemaVersion: typeof AI_TENANT_RECOMMENDATION_VERSION;
  targetKind: AiLearningTargetKind;
  targetId: string;
  status: "shadow";
  sampleSize: number;
  distinctRelationships: number;
  positiveWeight: number;
  negativeWeight: number;
  confidence: number;
  conflictRatio: number;
  windowStartMs: number;
  windowEndMs: number;
  explanation: string;
  rollback: string;
  fingerprint: string;
};

export function compileTenantLearningRecommendations(
  signals: AiLearningSignalEvidence[],
  nowMs = Date.now()
): AiTenantLearningRecommendation[] {
  const groups = new Map<string, AiLearningSignalEvidence[]>();
  for (const signal of signals) {
    if (!signal.accepted || signal.expiresAtMs <= nowMs || signal.weight === 0) continue;
    const key = `${signal.targetKind}:${signal.targetId}`;
    groups.set(key, [...(groups.get(key) || []), signal]);
  }
  const recommendations: AiTenantLearningRecommendation[] = [];
  for (const evidence of groups.values()) {
    const relationships = new Set(evidence.map((item) => item.relationshipKey).filter(Boolean));
    if (evidence.length < AI_LEARNING_MIN_SAMPLE || relationships.size < AI_LEARNING_MIN_RELATIONSHIPS) continue;
    const positiveWeight = evidence.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    const negativeWeight = evidence.reduce((sum, item) => sum + Math.abs(Math.min(0, item.weight)), 0);
    const totalWeight = positiveWeight + negativeWeight;
    const rawConfidence = totalWeight ? positiveWeight / totalWeight : 0;
    const sampleFactor = Math.min(1, evidence.length / 20);
    const diversityFactor = Math.min(1, relationships.size / 8);
    const confidence = Number((rawConfidence * (0.55 + 0.25 * sampleFactor + 0.2 * diversityFactor)).toFixed(4));
    const conflictRatio = Number((totalWeight ? Math.min(positiveWeight, negativeWeight) / totalWeight : 1).toFixed(4));
    if (confidence < 0.62 || conflictRatio > 0.35) continue;
    const first = evidence.reduce((min, item) => Math.min(min, item.observedAtMs), nowMs);
    const last = evidence.reduce((max, item) => Math.max(max, item.observedAtMs), 0);
    const targetKind = evidence[0]!.targetKind;
    const targetId = evidence[0]!.targetId;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ version: AI_TENANT_RECOMMENDATION_VERSION, targetKind, targetId, evidence: evidence.map((item) => item.signalId).sort() }))
      .digest("hex")
      .slice(0, 32);
    recommendations.push({
      schemaVersion: AI_TENANT_RECOMMENDATION_VERSION,
      targetKind,
      targetId,
      status: "shadow",
      sampleSize: evidence.length,
      distinctRelationships: relationships.size,
      positiveWeight: Number(positiveWeight.toFixed(4)),
      negativeWeight: Number(negativeWeight.toFixed(4)),
      confidence,
      conflictRatio,
      windowStartMs: first,
      windowEndMs: last,
      explanation: `${evidence.length} sinais de ${relationships.size} relacionamentos; confiança ${Math.round(confidence * 100)}%; correlação observada, não causalidade provada.`,
      rollback: "Desativar ou arquivar esta recomendação restaura o comportamento anterior sem apagar sinais brutos anonimizados.",
      fingerprint,
    });
  }
  return recommendations.sort((a, b) => b.confidence - a.confidence || b.sampleSize - a.sampleSize);
}
