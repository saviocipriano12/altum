import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { deliverEcommerceActionTemplate, EcommerceDeliveryPendingError } from "@/lib/server/ecommerce-action-delivery";
import { decideEcommerceAgentExecution } from "@/lib/ecommerce-agent-policy";
import { freezeShopifyActionPlan, shopifyActionFingerprint, EcommerceActionAuthorizationError, EcommerceActionPreparingError } from "@/lib/server/commerce/shopify-action-authority";
import { readAuthorizedShopifyOccurrence } from "@/lib/server/commerce/shopify-occurrence";
import { commerceSnapshotDigest } from "@/lib/server/commerce/event-identity";
import {
  automationTemplateForAction,
  interpolateEcommerceTemplateParams,
  normalizeEcommerceActionType,
  normalizeEcommerceAutomationSettings,
  type EcommerceAutomationSettings,
} from "@/lib/server/ecommerce";

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function toMillis(value: unknown) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate?: unknown }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

async function claimAction(ref: FirebaseFirestore.DocumentReference, runId: string, tenantId: string, expected: Record<string, unknown>, configurationDigest: string) {
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || clean(snap.data()?.status, 40) !== "pending") return "busy";
    if (snap.data()?.tenantId !== tenantId) return "blocked";
    if (expected.sourceProtocolVersion === 1) {
      if (snap.data()?.sourceActionFingerprint !== expected.sourceActionFingerprint || shopifyActionFingerprint(snap.data()!) !== expected.sourceActionFingerprint) return "blocked";
      try {
        const source = await readAuthorizedShopifyOccurrence(tx, String(expected.sourceEventId), tenantId);
        const settings = (await tx.get(adminDb.collection("tenant_settings").doc(tenantId))).data();
        if (commerceSnapshotDigest(normalizeEcommerceAutomationSettings(settings?.ecommerceAutomation)) !== configurationDigest) return "blocked";
        const plan = source.occurrence.actionPlan;
        if (!plan && source.occurrence.status !== "done") return "preparing";
        if (plan && (plan.protocolVersion !== 1 || plan.configurationDigest !== configurationDigest || !Array.isArray(plan.actions)
          || !plan.actions.some((entry: { id: string; fingerprint: string }) => entry.id === ref.id && entry.fingerprint === expected.sourceActionFingerprint))) return "blocked";
      } catch (error) {
        if (error instanceof Error && /^SHOPIFY_OCCURRENCE_[A-Z_]+$/.test(error.message)) return "blocked";
        throw error;
      }
    }
    tx.set(ref, {
      status: "processing",
      processingRunId: runId,
      deliveryProtocolVersion: 1,
      processingStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return "claimed";
  });
}

async function settleActionClaim(ref: FirebaseFirestore.DocumentReference, runId: string, patch: Record<string, unknown>) {
  return adminDb.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists || current.data()?.status !== "processing" || current.data()?.processingRunId !== runId) return false;
    tx.set(ref, patch, { merge: true });
    return true;
  });
}

const PROCESSING_LEASE_MS = 15 * 60_000;
const SCHEDULING_BACKFILL_LIMIT = 250;

async function backfillPendingActionSchedules(tenantId: string, now: Date) {
  // Actions created before nextAttemptAt existed cannot participate in the
  // ordered query below. Make the migration lazy and safe for live tenants.
  const snap = await adminDb.collection("ecommerce_commercial_actions")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "pending")
    .limit(SCHEDULING_BACKFILL_LIMIT)
    .get();
  const missing = snap.docs.filter((doc) => !doc.data().nextAttemptAt);
  if (!missing.length) return 0;

  const writer = adminDb.bulkWriter();
  for (const doc of missing) {
    writer.set(doc.ref, {
      nextAttemptAt: doc.data().createdAt || now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  await writer.close();
  return missing.length;
}

async function recoverExpiredActionClaims(tenantId: string, now: number) {
  const staleBefore = now - PROCESSING_LEASE_MS;
  const snap = await adminDb.collection("ecommerce_commercial_actions")
    .where("tenantId", "==", tenantId)
    .where("status", "==", "processing")
    .limit(SCHEDULING_BACKFILL_LIMIT)
    .get();
  let recovered = 0;

  for (const doc of snap.docs) {
    if (toMillis(doc.data().processingStartedAt) > staleBefore) continue;
    const restored = await adminDb.runTransaction(async (tx) => {
      const current = await tx.get(doc.ref);
      if (!current.exists || clean(current.data()?.status, 40) !== "processing") return false;
      if (toMillis(current.data()?.processingStartedAt) > staleBefore) return false;
      const safeRecovery = current.data()?.deliveryProtocolVersion === 1;
      tx.set(doc.ref, {
        status: safeRecovery ? "pending" : "failed",
        processingRunId: null,
        processingStartedAt: null,
        nextAttemptAt: new Date(now),
        lastSendError: safeRecovery ? "processing_lease_expired" : "legacy_delivery_outcome_requires_review",
        lastSendErrorAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return true;
    });
    if (restored) recovered += 1;
  }
  return recovered;
}

export type EcommerceAgentProcessResult = {
  actionId: string;
  status: "sent" | "ready" | "observed" | "skipped" | "busy" | "failed" | "pending";
  reason?: string;
  chatId?: string;
};

export async function processTenantEcommerceActions(input: {
  tenantId: string;
  automation: EcommerceAutomationSettings;
  limit?: number;
  dryRun?: boolean;
  actor: { id: string; name: string };
  source: "manual" | "webhook" | "scheduled";
  shopifySourceEventId?: string;
}) {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  const limit = Math.max(1, Math.min(25, Number(input.limit || input.automation.agent.maxActionsPerRun)));
  if (input.shopifySourceEventId && input.source !== "webhook") throw new EcommerceActionAuthorizationError("SOURCE_CONTEXT_INVALID");
  const plan = input.shopifySourceEventId ? await freezeShopifyActionPlan(input.tenantId, input.shopifySourceEventId, input.automation, true) : null;
  const schedulingBackfilled = plan ? 0 : await backfillPendingActionSchedules(input.tenantId, new Date(startedAt));
  const recoveredClaims = plan ? 0 : await recoverExpiredActionClaims(input.tenantId, startedAt);
  const candidates = plan ? (plan.actions.length ? await adminDb.getAll(...plan.actions.map(action => adminDb.collection("ecommerce_commercial_actions").doc(action.id))) : [])
    : (await adminDb.collection("ecommerce_commercial_actions")
    .where("tenantId", "==", input.tenantId)
    .where("status", "==", "pending")
    .orderBy("nextAttemptAt", "asc")
    .limit(Math.min(100, limit * 4))
    .get()).docs;
  const actionDocs = candidates
    .filter((doc) => doc.exists && doc.data()?.status === "pending" && toMillis(doc.data()?.nextAttemptAt) <= Date.now())
    .slice(0, limit);
  const results: EcommerceAgentProcessResult[] = [];

  for (const doc of actionDocs) {
    const actionStartedAt = Date.now();
    const action = doc.data() as Record<string, unknown>;
    const actionType = normalizeEcommerceActionType(action.type);
    const template = actionType ? automationTemplateForAction(input.automation, actionType) : null;
    const decision = decideEcommerceAgentExecution({
      rollout: input.automation.agent,
      tenantId: input.tenantId,
      actionId: doc.id,
      subjectKey: clean(action.externalId, 180) || clean(action.leadId, 180) || doc.id,
      templateEnabled: Boolean(template?.enabled),
      hasTemplate: Boolean(template?.templateName),
      hasPhone: Boolean(clean(action.customerPhone, 80)),
    });
    const claim = actionType && !input.dryRun && decision.shouldSend
      ? await claimAction(doc.ref, runId, input.tenantId, action, commerceSnapshotDigest(input.automation)) : null;
    let result: EcommerceAgentProcessResult;

    if (!actionType) {
      result = { actionId: doc.id, status: "skipped", reason: "invalid_action_type" };
    } else if (input.dryRun) {
      result = { actionId: doc.id, status: decision.eligible ? "ready" : "skipped", reason: decision.reason };
    } else if (!decision.shouldSend) {
      result = {
        actionId: doc.id,
        status: decision.reason === "shadow_only" ? "observed" : "skipped",
        reason: decision.reason,
      };
    } else if (claim !== "claimed") {
      result = { actionId: doc.id, status: claim === "busy" ? "busy" : "skipped", reason: claim === "busy" ? "already_claimed" : claim === "preparing" ? "source_preparing" : "authorization_changed" };
    } else {
      try {
        const params = interpolateEcommerceTemplateParams(template?.params || [], action);
        const sent = await deliverEcommerceActionTemplate({
          tenantId: input.tenantId,
          actionId: doc.id,
          templateName: template?.templateName || "",
          languageCode: template?.languageCode || "pt_BR",
          bodyParams: params,
          actor: input.actor,
          automatic: true,
        });
        const chatId = sent.chatId;
        const finalized = await settleActionClaim(doc.ref, runId, {
          status: "done",
          agentVersion: decision.assignedVersion,
          agentRunId: runId,
          whatsappSentAt: FieldValue.serverTimestamp(),
          whatsappSentBy: sent.actor.id,
          whatsappSentByName: sent.actor.name,
          whatsappChatId: chatId,
          whatsappTemplateName: template?.templateName,
          whatsappTemplateLanguage: template?.languageCode,
          whatsappTemplateParams: params,
          whatsappMetaMessageId: sent.metaMessageId || null,
          resolvedAt: FieldValue.serverTimestamp(),
          resolvedBy: input.actor.id,
          resolvedByName: input.actor.name,
          updatedAt: FieldValue.serverTimestamp(),
        });
        result = { actionId: doc.id, status: finalized ? "sent" : "busy", chatId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "send_failed";
        const policyBlocked = error instanceof EcommerceActionAuthorizationError;
        const pendingDelivery = error instanceof EcommerceDeliveryPendingError || error instanceof EcommerceActionPreparingError;
        const attempts = Math.max(0, Number(action.sendAttempts || 0)) + (pendingDelivery || policyBlocked ? 0 : 1);
        const deadLettered = policyBlocked || attempts >= 5;
        const retryDelayMinutes = Math.min(360, 5 * (2 ** Math.max(0, attempts - 1)));
        const finalized = await settleActionClaim(doc.ref, runId, {
          status: deadLettered ? "failed" : "pending",
          sendAttempts: attempts,
          lastSendError: message,
          lastSendErrorAt: FieldValue.serverTimestamp(),
          nextAttemptAt: deadLettered ? null : new Date(Date.now() + retryDelayMinutes * 60_000),
          processingRunId: null,
          ...(policyBlocked ? { policyBlocked: true } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (deadLettered && finalized) {
          await adminDb.collection("ecommerce_agent_dead_letters").doc(doc.id).set({
            tenantId: input.tenantId,
            actionId: doc.id,
            actionType,
            leadId: clean(action.leadId, 180) || null,
            externalId: clean(action.externalId, 180) || null,
            agentVersion: decision.assignedVersion,
            attempts,
            lastError: message,
            status: "open",
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
        }
        result = { actionId: doc.id, status: !finalized ? "busy" : policyBlocked ? "skipped" : pendingDelivery ? "pending" : "failed", reason: message };
      }
    }

    results.push(result);
    await adminDb.collection("ecommerce_agent_traces").add({
      tenantId: input.tenantId,
      runId,
      actionId: doc.id,
      actionType: actionType || "invalid",
      leadId: clean(action.leadId, 180) || null,
      externalId: clean(action.externalId, 180) || null,
      agentVersion: decision.assignedVersion,
      mode: input.automation.agent.mode,
      rolloutPercent: input.automation.agent.rolloutPercent,
      rolloutBucket: decision.bucket,
      experimentBucket: decision.experimentBucket,
      decision: decision.reason,
      result: result.status,
      source: input.source,
      latencyMs: Date.now() - actionStartedAt,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  const summary = {
    runId,
    tenantId: input.tenantId,
    source: input.source,
    dryRun: input.dryRun === true,
    agentVersion: input.automation.agent.agentVersion,
    mode: input.automation.agent.mode,
    processed: results.length,
    sent: results.filter((item) => item.status === "sent").length,
    failed: results.filter((item) => item.status === "failed").length,
    pendingDelivery: results.filter((item) => item.status === "pending").length,
    observed: results.filter((item) => item.status === "observed").length,
    skipped: results.filter((item) => item.status === "skipped" || item.status === "busy").length,
    recoveredClaims,
    schedulingBackfilled,
    latencyMs: Date.now() - startedAt,
  };
  if (!input.dryRun) {
    await adminDb.collection("ecommerce_agent_runs").doc(runId).set({
      ...summary,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return { ...summary, results };
}
