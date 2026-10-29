import { createHash, randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { supportsRecoverableInboundAction } from "@/lib/automation-effect-contract";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import type { TenantAutomationDoc } from "@/lib/server/automations";
import { normalizeOutboundText } from "@/lib/server/chat-outbound-payload";
import { crmMutationBaseline } from "@/lib/server/crm/field-ownership";
import { loadTenantPipelineInTransaction } from "@/lib/server/crm/pipeline";
import { visitTenantAutomationCatalogue } from "@/lib/server/automation-catalogue";

export type InboundAutomationClaim = { id: string; token: string; plan: TenantAutomationDoc; sourceMessageId?: string };
export type InboundAutomationAdmission = { id: string; automations: TenantAutomationDoc[] };
export class InboundAutomationPreparingError extends Error {
  retryAt = new Date(Date.now() + 2_000);
  constructor() { super("Automacao ainda registrando as acoes desta ocorrencia."); }
}
export function inboundAutomationExecutionId(tenantId: string, messageId: string, automationId: string) {
  return `automation_inbound_${createHash("sha256").update(JSON.stringify([tenantId, messageId, automationId])).digest("hex")}`;
}
function time(value: unknown) {
  if (value instanceof Date) return value.getTime();
  return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0;
}
export function inboundAutomationSourceKey(tenantId: string, messageId: string, source: Record<string, unknown>, chat: Record<string, unknown>) {
  const providerId = source.metaMessageId || source.inboundMetaMessageId;
  const channelId = source.channelId || chat.channelId;
  if (typeof providerId === "string" && providerId && typeof channelId === "string" && channelId) {
    return `provider_${createHash("sha256").update(JSON.stringify([tenantId, channelId, providerId])).digest("hex")}`;
  }
  return messageId;
}

/** Freeze eligibility, including an empty result, before any effect. A replay
 * may revoke an accepted action but must never discover new eligible actions. */
export async function admitInboundAutomationEvent(input: {
  tenantId: string; leadId: string; chatId: string; sourceMessageId: string;
  normalize: (id: string, data: Record<string, unknown>) => TenantAutomationDoc;
  matches: (automation: TenantAutomationDoc, lead: Record<string, unknown>, channel: string) => boolean;
}): Promise<InboundAutomationAdmission> {
  for (const id of [input.tenantId, input.leadId, input.chatId, input.sourceMessageId]) {
    if (!id || id !== id.trim() || id.length > 500 || id.includes("/")) throw new Error("Identidade de evento da automacao invalida.");
  }
  return adminDb.runTransaction(async tx => {
    const [source, chat, lead] = await Promise.all([
      tx.get(adminDb.collection("messages").doc(input.sourceMessageId)),
      tx.get(adminDb.collection("chats").doc(input.chatId)), tx.get(adminDb.collection("leads").doc(input.leadId)),
    ]);
    if (!source.exists || source.data()?.tenantId !== input.tenantId || source.data()?.chatId !== input.chatId || source.data()?.sender !== "client" ||
        (source.data()?.leadId && source.data()?.leadId !== input.leadId) || !chat.exists || chat.data()?.tenantId !== input.tenantId ||
        (source.data()?.channelId && source.data()?.channelId !== chat.data()?.channelId) || source.data()?.isGroup === true ||
        chat.data()?.leadId !== input.leadId || chat.data()?.isGroup === true || !lead.exists || lead.data()?.tenantId !== input.tenantId) {
      throw new Error("Fonte da automacao nao pertence ao cliente/conversa autorizados.");
    }
    const sourceEventKey = inboundAutomationSourceKey(input.tenantId, input.sourceMessageId, source.data()!, chat.data()!);
    const id = `automation_admission_${createHash("sha256").update(JSON.stringify([input.tenantId, sourceEventKey])).digest("hex")}`;
    const ref = adminDb.collection("jobs").doc(id), previous = await tx.get(ref);
    if (previous.exists) {
      const row = previous.data()!;
      if (row.type !== "automation_inbound_admission" || row.tenantId !== input.tenantId || row.leadId !== input.leadId ||
          row.chatId !== input.chatId || row.sourceEventKey !== sourceEventKey || row.status !== "accepted" || !Array.isArray(row.eligible) ||
          row.eligible.length > 120 || row.eligible.some((entry: { id?: unknown }) => typeof entry?.id !== "string" || !entry.id || entry.id.includes("/"))) {
        throw new Error("Admissao da automacao vinculada a outro destino.");
      }
      const docs = row.eligible.length ? await tx.getAll(...row.eligible.map((entry: { id: string }) => adminDb.collection("automations").doc(entry.id))) : [];
      return { id, automations: docs.filter(doc => doc.exists).map(doc => input.normalize(doc.id, doc.data()!)) };
    }
    // Page the complete snapshot; unrelated rules do not consume event capacity.
    // Keep each selected configuration's exact version for the execution fence.
    const selected: FirebaseFirestore.QueryDocumentSnapshot[] = [];
    let evaluated = 0;
    await visitTenantAutomationCatalogue(tx, input.tenantId, (id, data, snapshot) => {
      evaluated++;
      if (input.matches(input.normalize(id, data), lead.data()!, String(chat.data()?.channel || ""))) selected.push(snapshot);
      if (selected.length > 120) throw new Error("Admissao excede 120 automacoes elegiveis; nenhum efeito autorizado.");
    }, () => {});
    tx.create(ref, { type: "automation_inbound_admission", tenantId: input.tenantId, leadId: input.leadId, chatId: input.chatId,
      sourceMessageId: input.sourceMessageId, sourceEventKey, status: "accepted",
      eligible: selected.map(doc => ({ id: doc.id, configVersion: doc.updateTime })),
      evaluated, createdAt: FieldValue.serverTimestamp() });
    return { id, automations: selected.map(doc => input.normalize(doc.id, doc.data())) };
  });
}

/** Immutable plan/claim in the existing jobs store. Expired or failed runs are
 * NOT replayed blindly: non-message actions still need per-effect recovery. */
export async function claimInboundAutomationExecution(input: {
  tenantId: string; leadId: string; chatId: string; sourceMessageId: string; automation: TenantAutomationDoc;
  normalize: (id: string, data: Record<string, unknown>) => TenantAutomationDoc;
  admissionId?: string;
}): Promise<InboundAutomationClaim | null> {
  for (const id of [input.tenantId, input.leadId, input.chatId, input.sourceMessageId, input.automation.id]) {
    if (!id || id !== id.trim() || id.length > 500 || id.includes("/")) throw new Error("Identidade de evento da automacao invalida.");
  }
  if (input.automation.tenantId !== input.tenantId || input.automation.trigger !== "message_received") throw new Error("Plano de automacao fora do evento.");
  const token = randomUUID();
  // Only normalized operational config, never a copy of the customer's message.
  const { automation } = input;
  const snapshotPlan = (config: TenantAutomationDoc) => JSON.parse(JSON.stringify({ id: config.id, tenantId: config.tenantId, name: config.name,
    description: config.description, trigger: config.trigger, enabled: config.enabled,
    status: config.status, conditions: config.conditions, actions: config.actions })) as TenantAutomationDoc;
  const plan = snapshotPlan(automation);
  return adminDb.runTransaction(async tx => {
    const [source, chat, lead, currentConfig] = await Promise.all([
      tx.get(adminDb.collection("messages").doc(input.sourceMessageId)),
      tx.get(adminDb.collection("chats").doc(input.chatId)), tx.get(adminDb.collection("leads").doc(input.leadId)),
      tx.get(adminDb.collection("automations").doc(automation.id)),
    ]);
    if (!source.exists || source.data()?.tenantId !== input.tenantId || source.data()?.chatId !== input.chatId || source.data()?.sender !== "client" ||
        (source.data()?.leadId && source.data()?.leadId !== input.leadId) || !chat.exists || chat.data()?.tenantId !== input.tenantId ||
        (source.data()?.channelId && source.data()?.channelId !== chat.data()?.channelId) || source.data()?.isGroup === true ||
        chat.data()?.leadId !== input.leadId || chat.data()?.isGroup === true || !lead.exists || lead.data()?.tenantId !== input.tenantId) {
      throw new Error("Fonte da automacao nao pertence ao cliente/conversa autorizados.");
    }
    const sourceEventKey = inboundAutomationSourceKey(input.tenantId, input.sourceMessageId, source.data()!, chat.data()!);
    const id = inboundAutomationExecutionId(input.tenantId, sourceEventKey, automation.id);
    const ref = adminDb.collection("jobs").doc(id), existing = await tx.get(ref);
    if (existing.exists) {
      const row = existing.data()!;
      if (row.tenantId !== input.tenantId || row.chatId !== input.chatId || row.leadId !== input.leadId ||
          row.sourceEventKey !== sourceEventKey || row.automationId !== automation.id || row.type !== "automation_inbound_execution") {
        throw new Error("Ocorrencia da automacao ja vinculada a outro destino.");
      }
      if (row.status === "processing" && time(row.leaseUntil) <= Date.now()) {
        const recoverable = Number(row.attempts || 1) < 3 &&
          Array.isArray(row.plan?.actions) && row.plan.actions.length > 0 &&
          row.plan.actions.every((action: TenantAutomationDoc["actions"][number]) => supportsRecoverableInboundAction(action, Number(row.executionProtocolVersion))) &&
          currentConfig.exists && currentConfig.data()?.tenantId === input.tenantId && currentConfig.data()?.enabled !== false && currentConfig.data()?.status !== "paused" &&
          typeof row.automationConfigVersion?.isEqual === "function" && row.automationConfigVersion.isEqual(currentConfig.updateTime) &&
          isDeepStrictEqual(row.plan, snapshotPlan(input.normalize(automation.id, currentConfig.data()!)));
        if (recoverable) {
          tx.update(ref, { status: "processing", claimToken: token, leaseUntil: new Date(Date.now() + 60_000),
            attempts: Number(row.attempts || 1) + 1, updatedAt: FieldValue.serverTimestamp() });
          return { id, token, plan: row.plan as TenantAutomationDoc, sourceMessageId: String(row.sourceMessageId) };
        }
        tx.update(ref, { status: "reconciliation_required", lastError: "Execucao interrompida; conferir efeitos antes de retomar.", updatedAt: FieldValue.serverTimestamp() });
      }
      return null;
    }
    if (input.admissionId) {
      const admission = await tx.get(adminDb.collection("jobs").doc(input.admissionId)), row = admission.data();
      const entry = Array.isArray(row?.eligible) ? row.eligible.find((item: { id: string }) => item.id === automation.id) : null;
      if (!row || row.type !== "automation_inbound_admission" || row.tenantId !== input.tenantId || row.chatId !== input.chatId ||
          row.leadId !== input.leadId || row.sourceEventKey !== sourceEventKey || !entry ||
          typeof entry.configVersion?.isEqual !== "function" || !entry.configVersion.isEqual(currentConfig.updateTime)) {
        throw new Error("Plano da automacao revogado/alterado depois da admissao; exige revisao.");
      }
    }
    if (!currentConfig.exists || !currentConfig.updateTime || currentConfig.data()?.tenantId !== input.tenantId ||
        JSON.stringify(snapshotPlan(input.normalize(automation.id, currentConfig.data()!))) !== JSON.stringify(plan)) {
      throw new Error("Configuracao da automacao mudou durante a admissao do evento.");
    }
    const pipeline = plan.actions.some(action => action.type === "move_stage") ? await loadTenantPipelineInTransaction(tx, input.tenantId) : null;
    tx.create(ref, { tenantId: input.tenantId, type: "automation_inbound_execution", leadId: input.leadId, chatId: input.chatId,
      sourceMessageId: input.sourceMessageId, sourceEventKey, automationId: automation.id, plan,
      automationConfigVersion: currentConfig.updateTime, admissionId: input.admissionId || null,
      planFingerprint: createHash("sha256").update(JSON.stringify(plan)).digest("hex"),
      status: "processing", claimToken: token, leaseUntil: new Date(Date.now() + 60_000), executionProtocolVersion: 4, attempts: 1,
      crmBaseline: crmMutationBaseline(lead.data()!), crmPipeline: pipeline,
      completionMeaning: "actions_registered_not_external_delivery", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return { id, token, plan, sourceMessageId: input.sourceMessageId };
  });
}

/** Executed in the outbox's transaction immediately before its provider-attempt
 * fence. Revocation/deletion/drift after enqueue cannot authorize a stale send. */
export async function assertInboundAutomationDeliveryAllowed(job: Record<string, unknown>, tx: FirebaseFirestore.Transaction) {
  if (job.origin !== "automation" || (!job.automationInboundExecutionId && !job.automationSourceMessageId)) return;
  const fields = [job.tenantId, job.chatId, job.automationId, job.automationSourceMessageId, job.automationSourceLeadId, job.automationInboundExecutionId];
  if (!fields.every(value => typeof value === "string" && value.length > 0 && value.length <= 500 && value === value.trim() && !value.includes("/")) ||
      !Number.isSafeInteger(job.automationActionIndex) || Number(job.automationActionIndex) < 0) throw new Error("Falha de integridade: referencia de automacao invalida.");
  const [run, source, chat, config, lead] = await Promise.all([
    tx.get(adminDb.collection("jobs").doc(String(job.automationInboundExecutionId))),
    tx.get(adminDb.collection("messages").doc(String(job.automationSourceMessageId))),
    tx.get(adminDb.collection("chats").doc(String(job.chatId))),
    tx.get(adminDb.collection("automations").doc(String(job.automationId))),
    tx.get(adminDb.collection("leads").doc(String(job.automationSourceLeadId))),
  ]);
  const row = run.data(), current = config.data();
  const actions = Array.isArray(row?.plan?.actions) ? [...row.plan.actions].sort((a, b) => Number(a.sequenceOrder || 0) - Number(b.sequenceOrder || 0)) : [];
  if (!row || row.type !== "automation_inbound_execution" || row.tenantId !== job.tenantId ||
      row.chatId !== job.chatId || row.leadId !== job.automationSourceLeadId || row.sourceMessageId !== job.automationSourceMessageId || row.automationId !== job.automationId ||
      !source.exists || source.data()?.tenantId !== job.tenantId || source.data()?.chatId !== job.chatId || source.data()?.sender !== "client" ||
      (source.data()?.leadId && source.data()?.leadId !== job.automationSourceLeadId) || !chat.exists || chat.data()?.tenantId !== job.tenantId ||
      (source.data()?.channelId && source.data()?.channelId !== chat.data()?.channelId) || source.data()?.isGroup === true ||
      row.sourceEventKey !== inboundAutomationSourceKey(String(job.tenantId), String(job.automationSourceMessageId), source.data() || {}, chat.data() || {}) ||
      chat.data()?.leadId !== job.automationSourceLeadId || chat.data()?.isGroup === true || !lead.exists || lead.data()?.tenantId !== job.tenantId || !current || current.tenantId !== job.tenantId ||
      current.enabled === false || current.status === "paused" || !config.updateTime ||
      typeof row.automationConfigVersion?.isEqual !== "function" || !row.automationConfigVersion.isEqual(config.updateTime) ||
      actions[Number(job.automationActionIndex)]?.type !== "send_message" ||
      normalizeOutboundText(actions[Number(job.automationActionIndex)]?.text || "") !== normalizeOutboundText(job.text)) {
    throw new Error("Falha de integridade: fonte ou configuracao da automacao revogada/alterada; revisar envio.");
  }
  if (row.status === "processing" && (time(row.leaseUntil) > Date.now() ||
      (Number(row.attempts || 1) < 3 && actions.length > 0 && actions.every(action => supportsRecoverableInboundAction(action, Number(row.executionProtocolVersion)))))) {
    throw new InboundAutomationPreparingError();
  }
  if (row.status !== "done") throw new Error("Falha de integridade: automacao incompleta exige conciliacao antes de enviar.");
  if (job.automationScheduledGuardVersion === 1) {
    const id = job.scheduledAutomationJobId;
    if (typeof id !== "string" || !id || id.includes("/") || id.length > 500) throw new Error("Falha de integridade: agendamento invalido.");
    const scheduled = await tx.get(adminDb.collection("jobs").doc(id)), entry = scheduled.data();
    if (!entry || entry.type !== "automation_scheduled_action" || entry.tenantId !== job.tenantId || entry.chatId !== job.chatId ||
        entry.leadId !== job.automationSourceLeadId || entry.automationId !== job.automationId ||
        entry.inboundExecutionId !== job.automationInboundExecutionId || entry.sourceMessageId !== job.automationSourceMessageId ||
        entry.actionIndex !== job.automationActionIndex || entry.action?.type !== "send_message" ||
        normalizeOutboundText(entry.action?.text || "") !== normalizeOutboundText(job.text) || time(entry.executeAfter) > Date.now()) {
      throw new Error("Falha de integridade: agendamento alterado ou revogado.");
    }
    if (entry.status === "processing" && (time(entry.leaseUntil) > Date.now() ||
        (entry.schedulerProtocolVersion === 1 && Number(entry.attempts || 0) < 3))) throw new InboundAutomationPreparingError();
    if (entry.status !== "done" || entry.messageId !== job.messageId) throw new Error("Falha de integridade: agendamento incompleto exige conciliacao.");
  }
}

export async function finishInboundAutomationExecution(claim: InboundAutomationClaim, state: "done" | "skipped" | "reconciliation_required") {
  const ref = adminDb.collection("jobs").doc(claim.id);
  return adminDb.runTransaction(async tx => {
    const snapshot = await tx.get(ref), row = snapshot.data();
    if (!row || row.tenantId !== claim.plan.tenantId || row.claimToken !== claim.token || row.status !== "processing") return false;
    const status = time(row.leaseUntil) <= Date.now() ? "reconciliation_required" : state;
    tx.update(ref, { status, updatedAt: FieldValue.serverTimestamp(),
      ...(status === "reconciliation_required" ? { lastError: "Conferir efeitos registrados antes de retomar a ocorrencia." } : {}) });
    return status === state;
  });
}
