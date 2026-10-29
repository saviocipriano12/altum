import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { normalizePhone } from "@/app/lib/server/phone";
import { readAuthorizedShopifyOccurrence } from "./shopify-occurrence";
import { commerceSnapshotDigest } from "./event-identity";
import { deriveEcommerceOrderJourney } from "@/lib/ecommerce-journey";
import { normalizeEcommerceAutomationSettings, automationTemplateForAction, interpolateEcommerceTemplateParams, type EcommerceAutomationSettings } from "@/lib/server/ecommerce";
import { decideEcommerceAgentExecution } from "@/lib/ecommerce-agent-policy";
import { normalizeOutboundTemplate } from "@/lib/server/chat-outbound-template";
import { createChatOutboundIdentity } from "@/lib/server/chat-outbound-idempotency";
import { getChatStateDocId } from "@/lib/server/chat-state-identity";

export class EcommerceActionAuthorizationError extends Error {
  constructor(reason: string) { super(`ECOMMERCE_AUTHORITY_${reason}`); this.name = "EcommerceActionAuthorizationError"; }
}
export class EcommerceActionPreparingError extends Error {
  constructor() { super("ECOMMERCE_ACTION_SOURCE_PREPARING"); this.name = "EcommerceActionPreparingError"; }
}
export type EcommerceDeliveryAuthority = { protocolVersion: 1; actionId: string; sourceEventId: string; actionFingerprint: string;
  sourceClaimToken: string; automatic: boolean; configurationDigest: string | null; templateDigest: string };
const keys = ["tenantId", "connectionId", "provider", "type", "leadId", "externalId", "title", "detail", "customerName", "customerPhone", "customerEmail", "productNames", "amount", "metadata", "sourceEventId"];
export function shopifyActionFingerprint(data: Record<string, unknown>) { return commerceSnapshotDigest(Object.fromEntries(keys.map(key => [key, data[key] ?? null]))); }
function hash(parts: string[]) { return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32); }
function validId(value: unknown): value is string { return typeof value === "string" && Boolean(value) && !value.includes("/") && value.length <= 500; }
function millis(value: unknown) { return value && typeof value === "object" && "toMillis" in value && typeof value.toMillis === "function" ? value.toMillis() : 0; }

function entityAllows(type: unknown, source: FirebaseFirestore.DocumentData) {
  if (type === "abandoned_cart_recovery") return source.normalized?.cart?.status === "abandoned";
  const order = source.normalized?.order;
  if (!order) return false;
  const journey = deriveEcommerceOrderJourney(order);
  return type === "purchase_confirmation" ? journey.shouldConfirmPurchase : type === "tracking_available" ? journey.shouldSendTracking
    : type === "post_purchase_upsell" ? journey.shouldCreatePostPurchaseUpsell : false;
}

/** One immutable commercial intent. An update cannot silently rebind an accepted
 * recipient/content/source, reset status or promote an unproved legacy action. */
export async function createShopifyCommercialAction(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>) {
  if (![data.tenantId, data.sourceEventId, data.leadId].every(validId)) throw new EcommerceActionAuthorizationError("CONTEXT_INVALID");
  return adminDb.runTransaction(async tx => {
    const current = await tx.get(ref), source = await readAuthorizedShopifyOccurrence(tx, String(data.sourceEventId), String(data.tenantId));
    const lead = (await tx.get(adminDb.collection("leads").doc(String(data.leadId)))).data();
    const entity = data.type === "abandoned_cart_recovery" ? source.normalized.cart : source.normalized.order;
    if (!lead || lead.tenantId !== data.tenantId || source.connectionId !== data.connectionId || source.occurrence.status !== "processing"
      || !entityAllows(data.type, source) || (entity.externalOrderId || entity.externalCartId) !== data.externalId) throw new EcommerceActionAuthorizationError("SOURCE_INVALID");
    if (current.exists) {
      const row = current.data()!;
      if (row.sourceProtocolVersion !== 1 || row.tenantId !== data.tenantId || row.connectionId !== data.connectionId || row.leadId !== data.leadId
        || row.type !== data.type || row.externalId !== data.externalId || row.sourceActionFingerprint !== shopifyActionFingerprint(row)) throw new EcommerceActionAuthorizationError("EXISTING_REQUIRES_REVIEW");
      if (row.sourceEventId !== data.sourceEventId && row.status === "pending" && !row.whatsappDelivery && !row.processingRunId) {
        const previousSource = await readAuthorizedShopifyOccurrence(tx, row.sourceEventId, String(data.tenantId));
        if (previousSource.occurrence.status === "done") {
          if (source.occurrence.actionPlan) throw new EcommerceActionAuthorizationError("PLAN_ALREADY_FROZEN");
          const fingerprint = shopifyActionFingerprint(data);
          tx.set(ref, { ...data, sourceProtocolVersion: 1, sourceRevision: Number(row.sourceRevision || 1) + 1, sourceActionFingerprint: fingerprint,
            updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          tx.create(adminDb.collection("leads").doc(String(data.leadId)).collection("events").doc(`ecommerce_action_${ref.id}_${String(data.sourceEventId)}`), {
            tenantId: data.tenantId, type: "ecommerce_pending_action_refreshed", actionId: ref.id, sourceEventId: data.sourceEventId,
            previousSourceEventId: row.sourceEventId, previousFingerprint: row.sourceActionFingerprint, fingerprint,
            completionMeaning: "pending_unbound_action_updated_not_delivered", createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
      return ref.id;
    }
    if (source.occurrence.actionPlan) throw new EcommerceActionAuthorizationError("PLAN_ALREADY_FROZEN");
    tx.create(ref, { ...data, provider: "shopify", sourceProtocolVersion: 1, sourceRevision: 1, sourceActionFingerprint: shopifyActionFingerprint(data), status: "pending",
      nextAttemptAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    return ref.id;
  });
}

export async function freezeShopifyActionPlan(tenantId: string, sourceEventId: string, automation: EcommerceAutomationSettings, allowProcessing = false) {
  return adminDb.runTransaction(async tx => {
    const source = await readAuthorizedShopifyOccurrence(tx, sourceEventId, tenantId);
    if (!allowProcessing && source.occurrence.status !== "done" && !source.occurrence.actionPlan) throw new EcommerceActionPreparingError();
    const configurationDigest = commerceSnapshotDigest(automation);
    if (source.occurrence.actionPlan) {
      const plan = source.occurrence.actionPlan;
      if (plan.protocolVersion !== 1 || plan.configurationDigest !== configurationDigest || !Array.isArray(plan.actions) || plan.actions.length > 25) throw new EcommerceActionAuthorizationError("PLAN_CHANGED");
      return plan as { protocolVersion: 1; configurationDigest: string; actions: { id: string; fingerprint: string }[] };
    }
    const candidates = await tx.get(adminDb.collection("ecommerce_commercial_actions").where("tenantId", "==", tenantId).where("sourceEventId", "==", sourceEventId).limit(26));
    if (candidates.size === 26) throw new EcommerceActionAuthorizationError("PLAN_INCOMPLETE");
    const actions = candidates.docs.filter(doc => ["pending", "processing"].includes(doc.data().status)).map(doc => {
      const row = doc.data();
      if (row.sourceProtocolVersion !== 1 || row.provider !== "shopify" || row.connectionId !== source.connectionId || row.sourceActionFingerprint !== shopifyActionFingerprint(row)) throw new EcommerceActionAuthorizationError("ACTION_CHANGED");
      return { id: doc.id, fingerprint: row.sourceActionFingerprint as string };
    }).sort((a, b) => a.id.localeCompare(b.id));
    const plan = { protocolVersion: 1 as const, configurationDigest, actions };
    tx.update(adminDb.collection("ecommerce_events").doc(sourceEventId), { "occurrence.actionPlan": plan }); return plan;
  });
}

export async function prepareAutomaticShopifyAction(tenantId: string, actionId: string) {
  const action = (await adminDb.collection("ecommerce_commercial_actions").doc(actionId).get()).data();
  if (action?.tenantId === tenantId && action.sourceProtocolVersion === 1) {
    const settings = (await adminDb.collection("tenant_settings").doc(tenantId).get()).data();
    await freezeShopifyActionPlan(tenantId, action.sourceEventId, normalizeEcommerceAutomationSettings(settings?.ecommerceAutomation));
  }
}

export async function validateEcommerceDeliveryAuthority(tx: FirebaseFirestore.Transaction, tenantId: string, action: FirebaseFirestore.DocumentData,
  guard: EcommerceDeliveryAuthority, chatId: string, template: ReturnType<typeof normalizeOutboundTemplate>) {
  try {
    if (guard.protocolVersion !== 1 || action.sourceProtocolVersion !== 1 || action.provider !== "shopify" || action.tenantId !== tenantId
      || action.sourceEventId !== guard.sourceEventId || action.sourceActionFingerprint !== guard.actionFingerprint
      || shopifyActionFingerprint(action) !== guard.actionFingerprint || commerceSnapshotDigest(template) !== guard.templateDigest
      || !(guard.automatic ? ["pending", "processing"] : ["pending", "processing", "failed"]).includes(action.status)) throw new Error("ACTION_CHANGED");
    const source = await readAuthorizedShopifyOccurrence(tx, guard.sourceEventId, tenantId);
    const sourceEntity = action.type === "abandoned_cart_recovery" ? source.normalized.cart : source.normalized.order;
    if (source.connectionId !== action.connectionId || source.occurrence.claimToken !== guard.sourceClaimToken || !entityAllows(action.type, source)
      || (sourceEntity.externalOrderId || sourceEntity.externalCartId) !== action.externalId || sourceEntity.totalPrice !== action.amount
      || normalizePhone(String(sourceEntity.customerPhone || "")) !== normalizePhone(String(action.customerPhone || ""))) throw new Error("SOURCE_CHANGED");
    const kind = action.type === "abandoned_cart_recovery" ? "ecommerce_abandoned_carts" : "ecommerce_orders";
    const current = (await tx.get(adminDb.collection(kind).doc(hash([tenantId, action.connectionId, action.externalId])))).data();
    if (!current || current.tenantId !== tenantId || current.connectionId !== action.connectionId || current.leadId !== action.leadId
      || !entityAllows(action.type, { normalized: action.type === "abandoned_cart_recovery" ? { cart: current } : { order: current } })
      || normalizePhone(String(current.customerPhone || "")) !== normalizePhone(String(action.customerPhone || ""))
      || current.totalPrice !== action.amount) throw new Error("BUSINESS_STATE_CHANGED");
    if ((action.metadata?.checkoutUrl && current.checkoutUrl !== action.metadata.checkoutUrl)
      || (action.type === "tracking_available" && (String(current.trackingCode || "") !== String(action.metadata?.trackingCode || "") || String(current.trackingUrl || "") !== String(action.metadata?.trackingUrl || "")))) throw new Error("BUSINESS_STATE_CHANGED");
    const [lead, chat, state] = await Promise.all([tx.get(adminDb.collection("leads").doc(action.leadId)), tx.get(adminDb.collection("chats").doc(chatId)),
      tx.get(adminDb.collection("chat_state").doc(getChatStateDocId(tenantId, chatId)))]);
    if (lead.data()?.tenantId !== tenantId || chat.data()?.tenantId !== tenantId || chat.data()?.isGroup === true || (chat.data()?.channel && chat.data()?.channel !== "whatsapp")
      || (lead.data()?.telefone && normalizePhone(String(lead.data()?.telefone)) !== normalizePhone(String(action.customerPhone || "")))
      || (chat.data()?.leadId && chat.data()?.leadId !== action.leadId)
      || normalizePhone(String(chat.data()?.contactPhone || "")) !== normalizePhone(String(action.customerPhone || ""))) throw new Error("DESTINATION_CHANGED");
    const plan = source.occurrence.actionPlan;
    if (plan && (!Array.isArray(plan.actions) || !plan.actions.some((entry: { id: string; fingerprint: string }) => entry.id === guard.actionId && entry.fingerprint === guard.actionFingerprint))) throw new Error("PLAN_CHANGED");
    if (guard.automatic) {
      const settings = (await tx.get(adminDb.collection("tenant_settings").doc(tenantId))).data();
      const automation = normalizeEcommerceAutomationSettings(settings?.ecommerceAutomation), selected = automationTemplateForAction(automation, action.type);
      const decision = decideEcommerceAgentExecution({ rollout: automation.agent, tenantId, actionId: guard.actionId, subjectKey: action.externalId || action.leadId,
        templateEnabled: Boolean(selected?.enabled), hasTemplate: Boolean(selected?.templateName), hasPhone: Boolean(action.customerPhone) });
      if (!plan || plan.protocolVersion !== 1 || plan.configurationDigest !== guard.configurationDigest || commerceSnapshotDigest(automation) !== guard.configurationDigest
        || !decision.shouldSend || !selected || commerceSnapshotDigest(normalizeOutboundTemplate({ ...selected, bodyParams: interpolateEcommerceTemplateParams(selected.params, action) })) !== guard.templateDigest) throw new Error("CONFIGURATION_CHANGED");
      const human = state.data();
      if (human && (human.tenantId !== tenantId || human.chatId !== chatId || human.aiEnabled === false || human.humanOwnerUserId || millis(human.pausedUntil) > Date.now())) throw new Error("HUMAN_CONTROL");
    }
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? Number(error.code) : NaN;
    // Preserve retryable Firestore/gRPC I/O failures. An unavailable database
    // is not proof that a business authorization was permanently revoked.
    if ([4, 8, 10, 13, 14].includes(code)) throw error;
    const reason = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "BLOCKED_OR_CHANGED";
    throw error instanceof EcommerceActionAuthorizationError ? error : new EcommerceActionAuthorizationError(reason);
  }
}

/** Called both in preflight and the transaction that marks provider-attempt start. */
export async function assertEcommerceActionDeliveryAllowed(job: Record<string, unknown>, tx?: FirebaseFirestore.Transaction) {
  if (!job.ecommerceAuthority && !String(job.clientRequestId || "").startsWith("ecommerce-")) return;
  const check = async (transaction: FirebaseFirestore.Transaction) => {
    const guard = job.ecommerceAuthority as EcommerceDeliveryAuthority | undefined;
    if (!guard) {
      const identity = createChatOutboundIdentity({ tenantId: String(job.tenantId), chatId: String(job.chatId), clientRequestId: String(job.clientRequestId) });
      const bound = await transaction.get(adminDb.collection("ecommerce_commercial_actions").where("tenantId", "==", job.tenantId).where("whatsappDelivery.jobId", "==", identity.jobId).limit(2));
      if (bound.size !== 1 || bound.docs[0].data().sourceProtocolVersion === 1) throw new EcommerceActionAuthorizationError("GUARD_MISSING");
      return; // Unmigrated legacy paths retain their previous delivery contract.
    }
    if (!validId(guard.actionId) || !validId(guard.sourceEventId) || typeof guard.automatic !== "boolean") throw new EcommerceActionAuthorizationError("GUARD_INVALID");
    const action = (await transaction.get(adminDb.collection("ecommerce_commercial_actions").doc(guard.actionId))).data();
    if (!action || action.whatsappDelivery?.jobId !== createChatOutboundIdentity({ tenantId: String(job.tenantId), chatId: String(job.chatId), clientRequestId: String(job.clientRequestId) }).jobId) throw new EcommerceActionAuthorizationError("BINDING_CHANGED");
    if (!action.whatsappDelivery.ecommerceAuthority || commerceSnapshotDigest(action.whatsappDelivery.ecommerceAuthority) !== commerceSnapshotDigest(guard)) throw new EcommerceActionAuthorizationError("BINDING_CHANGED");
    await validateEcommerceDeliveryAuthority(transaction, String(job.tenantId), action, guard, String(job.chatId), normalizeOutboundTemplate(job as Parameters<typeof normalizeOutboundTemplate>[0]));
  };
  if (tx) await check(tx); else await adminDb.runTransaction(check);
}
