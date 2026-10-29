import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { isTenantBillingBlocked } from "@/lib/server/tenant";
import { buildAiRuntimePolicy, normalizeTenantAiOperatingProfile } from "@/lib/server/ai/operating-layer";
import { usageMonthDocId } from "@/lib/server/ai/usage-ledger";
import { observedMessageContent } from "@/lib/server/ai/inbound-enrichment-source";
import { normalizeAiConversationRollout, isAiConversationInTestScope } from "@/lib/ai-conversation-rollout";
import { readMatchingCommercialFenceTarget, messageInCommercialTarget, type ConversationCommercialFence } from "./conversation-commercial-context";
import { extractCommercialFactsWithModel, validateCommercialExtraction, type SemanticMessage, type SemanticFact } from "./semantic-extraction";

type Input = { fence: ConversationCommercialFence; messages: SemanticMessage[]; snapshots: FirebaseFirestore.DocumentSnapshot[] };
type Outcome = { status: string; facts: SemanticFact[]; runId?: string; settingsVersion?: FirebaseFirestore.Timestamp };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const key = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const version = (value?: FirebaseFirestore.Timestamp) => value ? `${value.seconds}:${value.nanoseconds}` : "";

/** Controlled rollout: no additional calls for companies outside this exact allowlist. */
function admitted(tenantId: string) {
  return process.env.ALTUM_CRM_SEMANTIC_ENABLED === "1" &&
    String(process.env.ALTUM_CRM_SEMANTIC_TENANTS || "").split(",").map(item => item.trim()).includes(tenantId);
}
async function currentSources(tx: FirebaseFirestore.Transaction, input: Input) {
  const target = await readMatchingCommercialFenceTarget(tx, input.fence);
  if (!target) return false;
  const rows = input.snapshots.length ? await tx.getAll(...input.snapshots.map(row => row.ref)) : [];
  return rows.every((row, index) => row.exists && row.data()?.tenantId === input.fence.tenantId && row.data()?.chatId === input.fence.chatId &&
    !!input.snapshots[index].createTime && !!input.snapshots[index].updateTime && row.createTime?.isEqual(input.snapshots[index].createTime!) &&
    row.updateTime?.isEqual(input.snapshots[index].updateTime!) && messageInCommercialTarget(row, target));
}

/** The result still requires the caller's guarded CRM commit; a provider response alone never writes the lead. */
export async function observeSemanticCommercialFacts(input: Input): Promise<Outcome> {
  const { tenantId, chatId, leadId, messageId } = input.fence;
  if (!admitted(tenantId)) return { status: "not_enabled", facts: [] };
  if (input.snapshots.some(snapshot => !snapshot.exists)) throw new Error("CRM_SEMANTIC_UNPROVEN_INPUT");
  const expected = input.snapshots.map(snapshot => {
    const row = snapshot.data()!, content = observedMessageContent(row, snapshot.createTime);
    const sender = String(row.sender || "").trim().toLowerCase();
    return { id: snapshot.id, text: content.text.replace(/\s+/g, " ").trim().slice(0, 4000), kind: content.kind,
      sender: sender === "client" || sender === "system" ? sender : "agent" };
  }).filter(message => message.text && message.sender !== "system");
  if (expected.length !== input.messages.length || new Set(input.messages.map(message => message.id)).size !== input.messages.length ||
      input.messages.some(message => !expected.some(row => row.id === message.id && row.text === message.text && row.sender === message.sender && row.kind === message.kind))) {
    throw new Error("CRM_SEMANTIC_UNPROVEN_INPUT");
  }
  if (!input.messages.some(message => message.sender === "client")) return { status: "no_customer_text", facts: [] };
  if (!process.env.OPENAI_API_KEY) return { status: "provider_unavailable", facts: [] };
  const reserveUsd = Number(process.env.ALTUM_CRM_SEMANTIC_RESERVATION_USD);
  if (!Number.isFinite(reserveUsd) || reserveUsd <= 0 || reserveUsd > 10) return { status: "budget_not_configured", facts: [] };
  const settingsRef = adminDb.collection("tenant_settings").doc(tenantId), month = new Date().toISOString().slice(0, 7);
  const bucketRef = adminDb.collection("crm_semantic_usage_monthly").doc(`${tenantId}_${month}`);
  const token = randomUUID();
  const admission = await adminDb.runTransaction(async tx => {
    if (!await currentSources(tx, input)) return { status: "context_changed" as const };
    const [settings, bucket, aggregate] = await Promise.all([tx.get(settingsRef), tx.get(bucketRef), tx.get(adminDb.collection("ai_usage_monthly").doc(usageMonthDocId(tenantId, month))),
      tx.get(adminDb.collection("tenant_entitlements").doc(tenantId)), tx.get(adminDb.collection("tenants").doc(tenantId))]);
    const ai = record(settings.data()?.ai), profile = normalizeTenantAiOperatingProfile(ai.operatingProfile), policy = buildAiRuntimePolicy(profile);
    if (ai.enabled === false || !settings.exists) return { status: "disabled" as const };
    if (await isTenantBillingBlocked(tenantId)) return { status: "billing_blocked" as const };
    await assertTenantModule(tenantId, "crm"); await assertTenantModule(tenantId, "ai");
    if (!isAiConversationInTestScope({ rollout: normalizeAiConversationRollout(ai.rollout), tenantId, chatId })) return { status: "outside_scope" as const };
    if (policy.primaryProvider !== "openai") return { status: "unsupported_provider" as const };
    if (policy.extractionModel !== "gpt-4.1-mini") return { status: "model_not_validated" as const };
    const runId = `crmsemantic_${key([tenantId, chatId, leadId, version(input.fence.leadGeneration), version(input.fence.chatGeneration), input.fence.contactId, version(input.fence.contactGeneration || undefined),
      version(input.fence.messageVersion), input.snapshots.map(row => [row.id, version(row.createTime), version(row.updateTime)]), version(settings.updateTime), policy.extractionModel,
      ...(input.fence.selectionId ? [input.fence.selectionId] : [])])}`;
    const runRef = adminDb.collection("crm_semantic_runs").doc(runId), existing = await tx.get(runRef);
    if (existing.data()?.status === "completed") {
      if (existing.data()?.tenantId !== tenantId || existing.data()?.chatId !== chatId || existing.data()?.leadId !== leadId) throw new Error("CRM_SEMANTIC_RECEIPT_IDENTITY_CONFLICT");
      return { status: "cached" as const, runId, facts: validateCommercialExtraction({ facts: existing.data()?.facts }, input.messages).facts, settingsVersion: settings.updateTime! };
    }
    if (existing.exists) {
      const expired = existing.data()?.leaseUntil?.toMillis?.() < Date.now();
      // An interrupted paid request has an unknown outcome. Never silently repeat the charge.
      if (expired && existing.data()?.status === "processing") tx.update(runRef, { status: "review_required", reason: "provider_outcome_unknown", updatedAt: FieldValue.serverTimestamp() });
      return { status: expired ? "review_required" as const : String(existing.data()?.status || "pending") };
    }
    const usage = bucket.data() || {};
    if (Number(usage.attempts || 0) + Number(aggregate.data()?.runs || 0) >= profile.monthlyUsageCap ||
        Number(usage.reservedUsd || 0) + Number(aggregate.data()?.estimatedCostUsd || 0) + reserveUsd > profile.monthlyBudgetUsd) return { status: "budget_exhausted" as const };
    tx.set(bucketRef, { tenantId, month, attempts: FieldValue.increment(1), reservedUsd: FieldValue.increment(reserveUsd), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.create(runRef, { tenantId, chatId, leadId, messageId, status: "processing", token, model: policy.extractionModel,
      reservedUsd: reserveUsd, leaseUntil: new Date(Date.now() + 120000), settingsRevision: version(settings.updateTime),
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { status: "claimed" as const, runId, model: policy.extractionModel, businessContext: String(ai.businessSummary || settings.data()?.name || ""), settingsVersion: settings.updateTime! };
  });
  if (admission.status === "cached") return { status: "cached", runId: admission.runId, facts: admission.facts || [], settingsVersion: admission.settingsVersion };
  if (admission.status !== "claimed" || !("runId" in admission)) {
    if (["processing", "review_required", "failed"].includes(admission.status)) throw new Error(`CRM_SEMANTIC_${admission.status.toUpperCase()}`);
    return { status: admission.status, facts: [] };
  }
  const runRef = adminDb.collection("crm_semantic_runs").doc(admission.runId!);
  try {
    const result = await extractCommercialFactsWithModel({ messages: input.messages, businessContext: admission.businessContext!, model: admission.model!, apiKey: process.env.OPENAI_API_KEY });
    const saved = await adminDb.runTransaction(async tx => {
      const sourcesMatch = await currentSources(tx, input);
      const [run, settings] = await Promise.all([tx.get(runRef), tx.get(settingsRef)]);
      if (run.data()?.token !== token || run.data()?.status !== "processing") return false;
      const valid = admitted(tenantId) && sourcesMatch && settings.updateTime?.isEqual(admission.settingsVersion!);
      tx.update(runRef, { status: valid ? "completed" : "discarded_context_changed", facts: valid ? result.facts : [], rejected: result.rejected,
        inputTokens: result.inputTokens, outputTokens: result.outputTokens, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.set(adminDb.collection("ai_usage_ledger").doc(admission.runId!), { tenantId, scope: "analysis", provider: "openai", model: result.model,
        agentId: "crm_semantic_observer", chatId, leadId, messageId, status: valid ? "success" : "error", inputTokens: result.inputTokens,
        outputTokens: result.outputTokens, estimatedCostUsd: null, metadata: { reservedUsd: reserveUsd, costSettlementPending: true }, createdAt: FieldValue.serverTimestamp() });
      return valid;
    });
    return { status: saved ? "completed" : "context_changed", facts: saved ? result.facts : [], runId: admission.runId, settingsVersion: admission.settingsVersion };
  } catch (error) {
    await adminDb.runTransaction(async tx => {
      const run = await tx.get(runRef);
      if (run.data()?.token === token && run.data()?.status === "processing") {
        tx.update(runRef, { status: "failed", reason: "provider_or_persistence_failed", updatedAt: FieldValue.serverTimestamp() });
        tx.set(adminDb.collection("ai_usage_ledger").doc(admission.runId!), { tenantId, scope: "analysis", provider: "openai", model: admission.model,
          agentId: "crm_semantic_observer", chatId, leadId, messageId, status: "error", inputTokens: null, outputTokens: null,
          estimatedCostUsd: null, metadata: { reservedUsd: reserveUsd, costSettlementPending: true, providerOutcomeUnknown: true }, createdAt: FieldValue.serverTimestamp() });
      }
    });
    throw error;
  }
}

export async function semanticObservationStillCurrent(tx: FirebaseFirestore.Transaction, input: Input, outcome: Outcome) {
  if (!["completed", "cached"].includes(outcome.status)) return true;
  if (!admitted(input.fence.tenantId) || !await currentSources(tx, input)) return false;
  const [settings] = await Promise.all([tx.get(adminDb.collection("tenant_settings").doc(input.fence.tenantId)),
    tx.get(adminDb.collection("tenant_entitlements").doc(input.fence.tenantId)), tx.get(adminDb.collection("tenants").doc(input.fence.tenantId))]);
  if (!settings.updateTime?.isEqual(outcome.settingsVersion!)) return false;
  await assertTenantModule(input.fence.tenantId, "crm"); await assertTenantModule(input.fence.tenantId, "ai");
  return !await isTenantBillingBlocked(input.fence.tenantId);
}
