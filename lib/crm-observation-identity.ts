/** An identity is never display text: trimming/truncation may select another record. */
export const isExactCrmRecordId = (value: unknown, max = 180): value is string => typeof value === "string" && value.length > 0 && value.length <= max &&
    value === value.trim() && !value.includes("/") && value !== "." && value !== ".." && !/[\u0000-\u001f\u007f]/.test(value);
export function crmObservationIdentity(input: { tenantId?: unknown; chatId?: unknown; messageId?: unknown }) {
  if (!isExactCrmRecordId(input.tenantId, 180) || !isExactCrmRecordId(input.chatId, 180) || !isExactCrmRecordId(input.messageId, 300)) return null;
  return { tenantId: input.tenantId, chatId: input.chatId, messageId: input.messageId };
}
