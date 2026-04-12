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

export type AiMonthlyUsageSnapshot = {
  tenantId: string;
  monthRef: string;
  runs: number;
  conversationRuns: number;
  fallbackRuns: number;
  errorRuns: number;
  estimatedCostUsd: number;
};

function monthRefFromDate(value = new Date()) {
  return value.toISOString().slice(0, 7);
}

function usageMonthDocId(tenantId: string, monthRef: string) {
  const safeTenant = String(tenantId || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 140);
  return `${safeTenant}_${monthRef}`;
}

function safeNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toMillis(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

export async function logAiUsage(entry: AiUsageLedgerEntry) {
  if (!entry.tenantId.trim()) return null;

  const ref = adminDb.collection("ai_usage_ledger").doc();
  const estimatedCostUsd = typeof entry.estimatedCostUsd === "number" ? entry.estimatedCostUsd : 0;
  const scope = entry.scope || "conversation";
  const monthRef = monthRefFromDate();
  const monthDocRef = adminDb.collection("ai_usage_monthly").doc(usageMonthDocId(entry.tenantId, monthRef));

  await ref.set({
    tenantId: entry.tenantId,
    scope,
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

  await monthDocRef.set(
    {
      tenantId: entry.tenantId,
      monthRef,
      runs: FieldValue.increment(1),
      conversationRuns: scope === "conversation" ? FieldValue.increment(1) : FieldValue.increment(0),
      fallbackRuns: entry.status === "fallback" ? FieldValue.increment(1) : FieldValue.increment(0),
      errorRuns: entry.status === "error" ? FieldValue.increment(1) : FieldValue.increment(0),
      estimatedCostUsd: FieldValue.increment(Math.max(0, Number(estimatedCostUsd || 0))),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  return ref.id;
}

export async function getAiMonthlyUsageSnapshot(
  tenantId: string,
  referenceDate = new Date()
): Promise<AiMonthlyUsageSnapshot> {
  const monthRef = monthRefFromDate(referenceDate);
  const docId = usageMonthDocId(tenantId, monthRef);
  const snap = await adminDb.collection("ai_usage_monthly").doc(docId).get();
  let data = snap.exists ? (snap.data() as Record<string, unknown>) : {};

  if (!snap.exists) {
    const monthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0));
    const nextMonthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1, 0, 0, 0));
    const ledgerSnap = await adminDb
      .collection("ai_usage_ledger")
      .where("tenantId", "==", tenantId)
      .limit(3000)
      .get();

    const monthEntries = ledgerSnap.docs
      .map((doc) => doc.data() as Record<string, unknown>)
      .filter((item) => {
        const ts = toMillis(item.createdAt);
        return ts >= monthStart.getTime() && ts < nextMonthStart.getTime();
      });

    const rebuilt = {
      tenantId,
      monthRef,
      runs: monthEntries.length,
      conversationRuns: monthEntries.filter((item) => String(item.scope || "") === "conversation").length,
      fallbackRuns: monthEntries.filter((item) => String(item.status || "") === "fallback").length,
      errorRuns: monthEntries.filter((item) => String(item.status || "") === "error").length,
      estimatedCostUsd: Number(
        monthEntries.reduce((sum, item) => sum + Number(item.estimatedCostUsd || 0), 0).toFixed(6)
      ),
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    };

    await adminDb.collection("ai_usage_monthly").doc(docId).set(rebuilt, { merge: true });
    data = rebuilt;
  }

  return {
    tenantId,
    monthRef,
    runs: Math.max(0, Math.round(safeNumber(data.runs, 0))),
    conversationRuns: Math.max(0, Math.round(safeNumber(data.conversationRuns, 0))),
    fallbackRuns: Math.max(0, Math.round(safeNumber(data.fallbackRuns, 0))),
    errorRuns: Math.max(0, Math.round(safeNumber(data.errorRuns, 0))),
    estimatedCostUsd: Math.max(0, Number(safeNumber(data.estimatedCostUsd, 0))),
  };
}
