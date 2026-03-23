import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type {
  AltumAiAutonomyMode,
  AltumAiProvider,
  AltumAiReasoningLevel,
  AltumAiResponseStyle,
  AltumAiTier,
} from "@/lib/server/ai/operating-layer";

export type AiUsageLedgerEntry = {
  tenantId: string;
  scope: "conversation" | "copilot" | "analysis" | "automation";
  provider: AltumAiProvider;
  model: string;
  agentId: string;
  chatId?: string;
  leadId?: string;
  messageId?: string;
  aiLogId?: string;
  decision?: string;
  confidence?: number | null;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  estimatedCostUsd?: number | null;
  tier?: AltumAiTier;
  autonomyMode?: AltumAiAutonomyMode;
  reasoningLevel?: AltumAiReasoningLevel;
  responseStyle?: AltumAiResponseStyle;
  status?: "success" | "error" | "fallback";
  metadata?: Record<string, unknown>;
};

export async function logAiUsage(entry: AiUsageLedgerEntry) {
  if (!entry.tenantId.trim()) return null;

  const ref = adminDb.collection("ai_usage_ledger").doc();
  await ref.set({
    tenantId: entry.tenantId,
    scope: entry.scope,
    provider: entry.provider,
    model: entry.model,
    agentId: entry.agentId,
    chatId: entry.chatId || null,
    leadId: entry.leadId || null,
    messageId: entry.messageId || null,
    aiLogId: entry.aiLogId || null,
    decision: entry.decision || null,
    confidence: typeof entry.confidence === "number" ? entry.confidence : null,
    latencyMs: typeof entry.latencyMs === "number" ? entry.latencyMs : null,
    inputTokens: typeof entry.inputTokens === "number" ? entry.inputTokens : null,
    outputTokens: typeof entry.outputTokens === "number" ? entry.outputTokens : null,
    estimatedCostUsd: typeof entry.estimatedCostUsd === "number" ? entry.estimatedCostUsd : null,
    tier: entry.tier || null,
    autonomyMode: entry.autonomyMode || null,
    reasoningLevel: entry.reasoningLevel || null,
    responseStyle: entry.responseStyle || null,
    status: entry.status || "success",
    metadata: entry.metadata || {},
    createdAt: FieldValue.serverTimestamp(),
  });

  return ref.id;
}
