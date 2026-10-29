import { createHash } from "node:crypto";
export const observationSnapshotVersion = (value?: { seconds: number; nanoseconds: number } | null) => value ? `${value.seconds}:${value.nanoseconds}` : "";
export function commercialObservationReceiptIdentity(input: {
  tenantId: string; chatId: string; leadId: string; messageId: string;
  messageGeneration: string; chatGeneration: string; leadGeneration: string;
  contactId: string | null; contactGeneration: string; sourceRevision: string; selectionId?: string;
}) {
  const context = ["crm-observation-v2", input.tenantId, input.chatId, input.leadId, input.messageId,
    input.messageGeneration, input.chatGeneration, input.leadGeneration, input.contactId, input.contactGeneration,
    ...(input.selectionId ? [input.selectionId] : [])];
  const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const key = hash(context);
  return { receiptId: `crmobs2_${key}`, logId: `crm_observer_${key}`, eventId: `crm_observer_${hash([...context, input.sourceRevision])}` };
}
