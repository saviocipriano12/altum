import { createHash } from "node:crypto";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";
import { commitChatOutboundEnqueue } from "@/lib/server/chat-outbound-enqueue";
import { createChatOutboundFingerprint, createChatOutboundIdentity } from "@/lib/server/chat-outbound-idempotency";
import { normalizeOutboundText } from "@/lib/server/chat-outbound-payload";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import type { InboundAutomationClaim } from "@/lib/server/automation-inbound-execution";
import { isProposalAutomationSchedule, queueScheduledProposalAutomationMessage } from "@/lib/server/automation-proposal-delivery";
import { isStageAutomationSchedule, queueScheduledStageAutomationMessage } from "@/lib/server/automation-stage-delivery";

/** A scheduled job is one occurrence, not the automation definition or the lead. */
export async function queueScheduledAutomationMessage(input: {
  tenantId: string; chatId: string; scheduledJobId: string;
  automationId: string; automationName: string; text: string;
  schedulerClaimToken?: string;
}) {
  const scheduled = await adminDb.collection("jobs").doc(input.scheduledJobId).get(), row = scheduled.data();
  if (isStageAutomationSchedule(input.scheduledJobId, row || {})) return queueScheduledStageAutomationMessage(input);
  if (isProposalAutomationSchedule(input.scheduledJobId, row || {})) return queueScheduledProposalAutomationMessage(input);
  if (/^automation_scheduled_[a-f0-9]{64}$/.test(input.scheduledJobId) && !row?.inboundExecutionId) {
    throw new Error("Fonte/plano do envio agendado ausente; nao permite fallback legado.");
  }
  if (row?.inboundExecutionId) {
    if (row.type !== "automation_scheduled_action" || row.tenantId !== input.tenantId || row.chatId !== input.chatId ||
        row.automationId !== input.automationId || typeof row.inboundExecutionId !== "string" || typeof row.sourceMessageId !== "string" ||
        typeof row.leadId !== "string" || !Number.isSafeInteger(row.actionIndex) || row.actionIndex < 0 ||
        row.action?.type !== "send_message" || normalizeOutboundText(row.action?.text || "") !== normalizeOutboundText(input.text) ||
        row.status !== "processing" || !input.schedulerClaimToken || row.claimToken !== input.schedulerClaimToken ||
        typeof row.leaseUntil?.toMillis !== "function" || row.leaseUntil.toMillis() <= Date.now() || !scheduled.updateTime) {
      throw new Error("Fonte/plano do envio agendado mudou ou nao esta autorizado.");
    }
    return queueAutomationText({ ...input, occurrenceId: input.scheduledJobId, kind: "scheduled_inbound",
      sourceMessageId: row.sourceMessageId, leadId: row.leadId, actionIndex: row.actionIndex, inboundExecutionId: row.inboundExecutionId,
      beforeCommit: async batch => {
        batch.update(scheduled.ref, { updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: scheduled.updateTime! });
      } });
  }
  return queueAutomationText({ ...input, occurrenceId: input.scheduledJobId, kind: "scheduled" });
}

/** A waiting cycle is a persisted client-message timestamp for one conversation,
 * not the cron invocation, current time, lead or outbound message text. */
export async function queueWaitingReplyAutomationMessage(input: {
  tenantId: string; chatId: string; waitingSinceMs: number; actionIndex: number;
  automationId: string; automationName: string; text: string;
}) {
  if (!Number.isSafeInteger(input.waitingSinceMs) || input.waitingSinceMs <= 0 ||
      !Number.isSafeInteger(input.actionIndex) || input.actionIndex < 0) throw new Error("Ocorrencia de espera invalida.");
  const occurrenceId = `waiting-${createHash("sha256").update(JSON.stringify([
    input.tenantId, input.chatId, input.waitingSinceMs, input.automationId, input.actionIndex,
  ])).digest("hex")}`;
  return queueAutomationText({ ...input, occurrenceId, kind: "waiting_reply" });
}

export async function queueInboundAutomationMessage(input: {
  tenantId: string; chatId: string; leadId: string; sourceMessageId: string; actionIndex: number;
  automationId: string; automationName: string; text: string; claim: InboundAutomationClaim;
}) {
  if (!Number.isSafeInteger(input.actionIndex) || input.actionIndex < 0) throw new Error("Acao de evento invalida.");
  const occurrenceId = `inbound-${createHash("sha256").update(JSON.stringify([input.claim.id, input.actionIndex])).digest("hex")}`;
  return queueAutomationText({ ...input, occurrenceId, kind: "inbound", inboundExecutionId: input.claim.id,
    beforeCommit: async (batch, chat) => {
      const sourceRef = adminDb.collection("messages").doc(input.sourceMessageId), runRef = adminDb.collection("jobs").doc(input.claim.id);
      const [source, run] = await adminDb.getAll(sourceRef, runRef);
      const row = run.data(), actions = Array.isArray(row?.plan?.actions) ? [...row.plan.actions].sort((a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)) : [];
      if (!source.exists || !source.updateTime || source.data()?.tenantId !== input.tenantId || source.data()?.chatId !== input.chatId ||
          source.data()?.sender !== "client" || chat.leadId !== input.leadId || chat.isGroup === true || !row || !run.updateTime ||
          row.status !== "processing" || row.claimToken !== input.claim.token || row.tenantId !== input.tenantId || row.chatId !== input.chatId ||
          typeof row.leaseUntil?.toMillis !== "function" || row.leaseUntil.toMillis() <= Date.now() ||
          row.sourceMessageId !== input.sourceMessageId || row.automationId !== input.automationId || row.leadId !== input.leadId ||
          actions[input.actionIndex]?.type !== "send_message" || normalizeOutboundText(actions[input.actionIndex]?.text || "") !== normalizeOutboundText(input.text)) {
        throw new Error("Fonte/plano de envio da automacao mudou ou nao esta autorizado.");
      }
      // CAS keeps source/claim changes from slipping between validation and the
      // atomic message+outbox commit. No customer content is modified.
      batch.update(sourceRef, { chatId: input.chatId }, { lastUpdateTime: source.updateTime });
      batch.update(runRef, { updatedAt: FieldValue.serverTimestamp() }, { lastUpdateTime: run.updateTime });
    } });
}

async function queueAutomationText(input: {
  tenantId: string; chatId: string; occurrenceId: string; kind: "scheduled" | "scheduled_inbound" | "waiting_reply" | "inbound";
  scheduledJobId?: string; waitingSinceMs?: number; actionIndex?: number;
  sourceMessageId?: string; leadId?: string; inboundExecutionId?: string;
  beforeCommit?: Parameters<typeof commitChatOutboundEnqueue>[0]["beforeCommit"];
  automationId: string; automationName: string; text: string;
}) {
  for (const value of [input.tenantId, input.chatId, input.occurrenceId, input.automationId]) {
    if (!value.trim() || value !== value.trim() || value.length > 180) throw new Error("Identidade de envio da automacao invalida.");
  }
  const text = normalizeOutboundText(input.text);
  // Preserve the scheduled occurrence key exactly for existing queued receipts.
  const key = createHash("sha256").update(JSON.stringify([input.tenantId, input.occurrenceId, input.automationId])).digest("hex");
  const bound = input.kind === "inbound" || input.kind === "scheduled_inbound";
  const metadata = input.kind === "scheduled" ? { scheduledAutomationJobId: input.scheduledJobId! }
    : bound ? { automationTrigger: "message_received", automationSourceMessageId: input.sourceMessageId!,
      automationSourceLeadId: input.leadId!, automationInboundExecutionId: input.inboundExecutionId!, automationActionIndex: input.actionIndex!, automationOccurrenceId: input.occurrenceId,
      ...(input.kind === "scheduled_inbound" ? { scheduledAutomationJobId: input.scheduledJobId!, automationScheduledGuardVersion: 1 } : {}) }
    : { automationWaitingSinceMs: input.waitingSinceMs!, automationActionIndex: input.actionIndex!,
      automationTrigger: "waiting_for_reply", automationOccurrenceId: input.occurrenceId };
  // The scope deliberately does not depend on the resolved conversation. A lead
  // reassignment on retry must conflict, never send a second copy elsewhere.
  const identity = createChatOutboundIdentity({ tenantId: input.tenantId,
    chatId: `automation-${key}`, clientRequestId: `automation-${key}` });
  return commitChatOutboundEnqueue({ tenantId: input.tenantId, chatId: input.chatId, identity,
    actor: { id: `automation:${input.automationId}`, name: input.automationName || "Automacao" },
    replyToId: null, preview: text, pauseAi: false, stateId: getChatStateDocId(input.tenantId, input.chatId),
    beforeCommit: input.beforeCommit,
    fingerprint: createChatOutboundFingerprint([input.kind === "scheduled_inbound" ? "automation-scheduled-inbound-text-v1" : bound ? "automation-inbound-text-v1" : "automation-text-v1", input.tenantId, input.chatId, text, null,
      ...(bound ? [input.automationId, input.sourceMessageId!, input.leadId!, input.inboundExecutionId!, input.actionIndex!, input.occurrenceId] : []),
      ...(input.kind === "scheduled_inbound" ? [input.scheduledJobId!] : [])]),
    build: chat => ({
      message: { text, type: "text", channel: String(chat.channel || "whatsapp"), automationGenerated: true, aiGenerated: false,
        automationId: input.automationId, ...metadata },
      job: { kind: "text", text, origin: "automation", automationId: input.automationId,
        ...metadata },
    }),
  });
}
