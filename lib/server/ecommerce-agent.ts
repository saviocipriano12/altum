import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { sendTenantChatTemplate } from "@/lib/server/chat-dispatch";
import { decideEcommerceAgentExecution } from "@/lib/ecommerce-agent-policy";
import {
  automationTemplateForAction,
  interpolateEcommerceTemplateParams,
  normalizeEcommerceActionType,
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

async function ensureWhatsAppChat(input: {
  tenantId: string;
  leadId: string;
  phone: string;
  name: string;
  actorName: string;
}) {
  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Acao sem telefone valido para WhatsApp.");
  const existing = await adminDb.collection("chats")
    .where("tenantId", "==", input.tenantId)
    .where("contactPhone", "==", phone)
    .limit(1)
    .get();
  if (!existing.empty) {
    const doc = existing.docs[0];
    await doc.ref.set({
      leadId: input.leadId || clean(doc.data().leadId, 180) || null,
      contactName: input.name || clean(doc.data().contactName, 180) || phone,
      channel: "whatsapp",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return doc.id;
  }
  const created = await adminDb.collection("chats").add({
    tenantId: input.tenantId,
    leadId: input.leadId || null,
    channel: "whatsapp",
    contactName: input.name || phone,
    contactPhone: phone,
    contactPhoneNormalized: phone,
    status: "open",
    ownerName: input.actorName,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastMessageTime: FieldValue.serverTimestamp(),
    lastMessage: "",
  });
  return created.id;
}

async function claimAction(ref: FirebaseFirestore.DocumentReference, runId: string) {
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || clean(snap.data()?.status, 40) !== "pending") return false;
    tx.set(ref, {
      status: "processing",
      processingRunId: runId,
      processingStartedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return true;
  });
}

export type EcommerceAgentProcessResult = {
  actionId: string;
  status: "sent" | "ready" | "observed" | "skipped" | "busy" | "failed";
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
}) {
  const startedAt = Date.now();
  const runId = crypto.randomUUID();
  const limit = Math.max(1, Math.min(25, Number(input.limit || input.automation.agent.maxActionsPerRun)));
  const actionsSnap = await adminDb.collection("ecommerce_commercial_actions")
    .where("tenantId", "==", input.tenantId)
    .where("status", "==", "pending")
    .limit(Math.min(75, limit * 3))
    .get();
  const actionDocs = actionsSnap.docs
    .filter((doc) => toMillis(doc.data().nextAttemptAt) <= Date.now())
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
    } else if (!(await claimAction(doc.ref, runId))) {
      result = { actionId: doc.id, status: "busy", reason: "already_claimed" };
    } else {
      try {
        const params = interpolateEcommerceTemplateParams(template?.params || [], action);
        const chatId = await ensureWhatsAppChat({
          tenantId: input.tenantId,
          leadId: clean(action.leadId, 180),
          phone: clean(action.customerPhone, 80),
          name: clean(action.customerName, 180),
          actorName: input.actor.name,
        });
        const sent = await sendTenantChatTemplate({
          tenantId: input.tenantId,
          chatId,
          templateName: template?.templateName || "",
          languageCode: template?.languageCode || "pt_BR",
          bodyParams: params,
          actor: input.actor,
          pauseAi: true,
          pauseMinutes: 30,
        });
        await doc.ref.set({
          status: "done",
          agentVersion: decision.assignedVersion,
          agentRunId: runId,
          whatsappSentAt: FieldValue.serverTimestamp(),
          whatsappSentBy: input.actor.id,
          whatsappSentByName: input.actor.name,
          whatsappChatId: chatId,
          whatsappTemplateName: template?.templateName,
          whatsappTemplateLanguage: template?.languageCode,
          whatsappTemplateParams: params,
          whatsappMetaMessageId: sent.metaMessageId || null,
          resolvedAt: FieldValue.serverTimestamp(),
          resolvedBy: input.actor.id,
          resolvedByName: input.actor.name,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        result = { actionId: doc.id, status: "sent", chatId };
      } catch (error) {
        const message = error instanceof Error ? error.message : "send_failed";
        const attempts = Math.max(0, Number(action.sendAttempts || 0)) + 1;
        const deadLettered = attempts >= 5;
        const retryDelayMinutes = Math.min(360, 5 * (2 ** Math.max(0, attempts - 1)));
        await doc.ref.set({
          status: deadLettered ? "failed" : "pending",
          sendAttempts: attempts,
          lastSendError: message,
          lastSendErrorAt: FieldValue.serverTimestamp(),
          nextAttemptAt: deadLettered ? null : new Date(Date.now() + retryDelayMinutes * 60_000),
          processingRunId: null,
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        if (deadLettered) {
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
        result = { actionId: doc.id, status: "failed", reason: message };
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
    observed: results.filter((item) => item.status === "observed").length,
    skipped: results.filter((item) => item.status === "skipped" || item.status === "busy").length,
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
