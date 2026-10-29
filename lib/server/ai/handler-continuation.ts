import { createHash, randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { aiCommercialSelectionId } from "@/lib/ai-commercial-selection";
import { prepareAiExecutionAuthority } from "./execution-authority";
import { observationSnapshotVersion as version } from "@/lib/server/crm/observation-receipt-identity";
import type { logAiUsage } from "./usage-ledger";
import type { trackAltumAgentLearning } from "./learning-loop";
import type { upsertConversationRuntimeState, upsertLeadMemory } from "./runtime-state";
import type { runLeadAutomations } from "@/lib/server/automations";

type Result = { decision: "respond" | "ask_more" | "handoff" | "skip"; reason: string };
type Context = { tenantId: string; chatId: string; messageId: string };
export type HandlerEffect =
  | { kind: "log"; input: { logDocId: string; data: FirebaseFirestore.DocumentData } }
  | { kind: "usage"; input: Parameters<typeof logAiUsage>[0] }
  | { kind: "learning"; input: Parameters<typeof trackAltumAgentLearning>[0] }
  | { kind: "automation"; input: Parameters<typeof runLeadAutomations>[0] }
  | { kind: "runtime"; input: Parameters<typeof upsertConversationRuntimeState>[0] }
  | { kind: "memory"; input: Parameters<typeof upsertLeadMemory>[0] };
export class HandlerContinuationReviewError extends Error {
  readonly code = "AI_HANDLER_CONTINUATION_REVIEW";
  constructor() { super("Atendimento anterior incompleto exige conciliacao antes de continuar."); }
}
const type = "ai_handler_continuation", leaseMs = 90_000;
function id(context: Context) { return `handler_tail_${createHash("sha256").update(JSON.stringify([context.tenantId, context.chatId, context.messageId])).digest("hex")}`; }
function clean(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (value instanceof Timestamp || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(item => clean(item ?? null));
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).map(([key, item]) => [key, clean(item)]));
}
function canonical(value: unknown): unknown {
  if (value instanceof Timestamp) return ["timestamp", value.seconds, value.nanoseconds];
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function digest(value: unknown) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function validate(row: FirebaseFirestore.DocumentData, context: Context) {
  if (row.type !== type || row.protocolVersion !== 1 || row.tenantId !== context.tenantId || row.chatId !== context.chatId || row.messageId !== context.messageId ||
      !Number.isSafeInteger(row.effectCount) || row.effectCount < 1 || row.effectCount > 8 || !["respond", "ask_more", "handoff", "skip"].includes(row.result?.decision) || typeof row.result?.reason !== "string") throw new HandlerContinuationReviewError();
  const effects = Array.from({ length: row.effectCount }, (_, index) => row.effects?.[index]?.effect);
  if (effects.some(effect => !effect || !["log", "usage", "learning", "automation", "runtime", "memory"].includes(effect.kind)) || digest({ result: row.result, effects }) !== row.planDigest) throw new HandlerContinuationReviewError();
}
async function source(tx: FirebaseFirestore.Transaction, context: Context) {
  await prepareAiExecutionAuthority(context.tenantId, context.chatId, tx);
  const [chat, message] = await Promise.all([tx.get(adminDb.collection("chats").doc(context.chatId)), tx.get(adminDb.collection("messages").doc(context.messageId))]);
  if (!chat.exists || chat.data()?.tenantId !== context.tenantId || !message.exists || message.data()?.tenantId !== context.tenantId || message.data()?.chatId !== context.chatId) throw new HandlerContinuationReviewError();
  return { chatGeneration: version(chat.createTime), messageGeneration: version(message.createTime), messageVersion: version(message.updateTime),
    commercialSelectionId: aiCommercialSelectionId(chat.data()) };
}

export async function completeHandlerEffects(input: Context & { result: Result; effects: HandlerEffect[] }) {
  const effects = clean(input.effects) as HandlerEffect[], result = clean(input.result) as Result;
  if (!effects.length || effects.length > 8) throw new HandlerContinuationReviewError();
  for (const effect of effects) {
    const payload = effect.kind === "log" ? effect.input.data : effect.input;
    if (payload.tenantId !== input.tenantId || "chatId" in payload && payload.chatId && payload.chatId !== input.chatId ||
        "messageId" in payload && payload.messageId && payload.messageId !== input.messageId) throw new HandlerContinuationReviewError();
  }
  const ref = adminDb.collection("jobs").doc(id(input)), planDigest = digest({ result, effects });
  await adminDb.runTransaction(async tx => {
    const [previous, binding] = await Promise.all([tx.get(ref), source(tx, input)]);
    if (previous.exists) { validate(previous.data()!, input); if (previous.data()?.planDigest !== planDigest) throw new HandlerContinuationReviewError(); return; }
    tx.create(ref, { ...binding, tenantId: input.tenantId, chatId: input.chatId, messageId: input.messageId,
      type, protocolVersion: 1, status: "pending", result, planDigest, effectCount: effects.length,
      effects: Object.fromEntries(effects.map((effect, index) => [index, { effect, status: "pending" }])), createdAt: FieldValue.serverTimestamp() });
  });
  return (await resumeHandlerEffects(input))!;
}

async function execute(effect: HandlerEffect, operationId: string) {
  switch (effect.kind) {
    case "usage": return (await import("./usage-ledger")).logAiUsage(effect.input, operationId);
    case "learning": return (await import("./learning-loop")).trackAltumAgentLearning(effect.input);
    case "automation": return (await import("@/lib/server/automations")).runLeadAutomations(effect.input);
    case "runtime": {
      const result = await (await import("./runtime-state")).upsertConversationRuntimeState(effect.input);
      if (!result.applied && result.reason === "context_changed") throw new HandlerContinuationReviewError();
      return result;
    }
    case "memory": return (await import("./runtime-state")).upsertLeadMemory(effect.input);
    case "log": return adminDb.runTransaction(async tx => {
      const ref = adminDb.collection("ai_logs").doc(effect.input.logDocId), previous = await tx.get(ref), data = effect.input.data;
      if (previous.exists && (previous.data()?.tenantId !== data.tenantId || previous.data()?.chatId !== data.chatId || previous.data()?.messageId !== data.messageId)) throw new HandlerContinuationReviewError();
      tx.set(ref, { ...data, createdAt: previous.data()?.createdAt || FieldValue.serverTimestamp() }, { merge: true });
    });
  }
}

export async function resumeHandlerEffects(context: Context): Promise<Result | null> {
  const ref = adminDb.collection("jobs").doc(id(context)), token = randomUUID();
  const admitted = await adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref); if (!snapshot.exists) return null;
    const row = snapshot.data()!; validate(row, context);
    const binding = await source(tx, context);
    if (Object.entries(binding).some(([key, value]) => key === "commercialSelectionId" ? (row[key] ?? null) !== value : row[key] !== value) || !["pending", "processing", "done"].includes(row.status)) throw new HandlerContinuationReviewError();
    if (row.status === "done") return { row, done: true };
    if (row.status === "processing" && row.leaseUntil?.toMillis?.() > Date.now()) throw new Error("Etapas finais da IA ainda estao em processamento.");
    tx.update(ref, { status: "processing", leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs), updatedAt: FieldValue.serverTimestamp() });
    return { row, done: false };
  });
  if (!admitted) return null;
  if (admitted.done) return admitted.row.result;
  try {
  for (let index = 0; index < admitted.row.effectCount; index++) {
    if (admitted.row.effects[index].status === "done") continue;
    await adminDb.runTransaction(async tx => {
      const snapshot = await tx.get(ref), row = snapshot.data()!; validate(row, context);
      const binding = await source(tx, context);
      if ((row.commercialSelectionId ?? null) !== binding.commercialSelectionId) throw new HandlerContinuationReviewError();
      if (row.leaseToken !== token || row.status !== "processing" || row.leaseUntil.toMillis() <= Date.now()) throw new HandlerContinuationReviewError();
      tx.update(ref, { [`effects.${index}.status`]: "processing" });
    });
    await execute(admitted.row.effects[index].effect, `${ref.id}:${index}`);
    await adminDb.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      const binding = await source(tx, context);
      if ((row?.commercialSelectionId ?? null) !== binding.commercialSelectionId) throw new HandlerContinuationReviewError();
      if (!row || row.leaseToken !== token || row.status !== "processing") throw new HandlerContinuationReviewError();
      tx.update(ref, { [`effects.${index}.status`]: "done", [`effects.${index}.completedAt`]: FieldValue.serverTimestamp() });
    });
  }
  await adminDb.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    const binding = await source(tx, context);
    if ((row?.commercialSelectionId ?? null) !== binding.commercialSelectionId) throw new HandlerContinuationReviewError();
    if (!row || row.leaseToken !== token || row.status !== "processing") throw new HandlerContinuationReviewError();
    validate(row, context);
    if (Object.values(row.effects as Record<string, { status: string }>).some(item => item.status !== "done")) throw new HandlerContinuationReviewError();
    tx.update(ref, { status: "done", leaseToken: null, leaseUntil: null, completedAt: FieldValue.serverTimestamp() });
  });
  return admitted.row.result;
  } catch (error) {
    await adminDb.runTransaction(async tx => {
      const row = (await tx.get(ref)).data();
      if (row?.leaseToken === token && row.status === "processing") tx.update(ref, { status: "pending", leaseToken: null, leaseUntil: null, updatedAt: FieldValue.serverTimestamp() });
    });
    throw error;
  }
}
