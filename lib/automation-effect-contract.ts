import type { TenantAutomationAction } from "@/lib/server/automations";

const atomicInternalTypes = new Set(["create_task", "follow_up", "alert_human", "add_note"]);
const atomicCrmTypes = new Set(["move_stage", "add_tag", "set_priority"]);
export function supportsAtomicCrmEffect(action: TenantAutomationAction) {
  return atomicCrmTypes.has(action.type);
}
export function supportsAtomicAutomationEffect(action: TenantAutomationAction) {
  return atomicInternalTypes.has(action.type) || supportsAtomicCrmEffect(action);
}

/** v2 proves immediate internal commits; v3 additionally proves durable message
 * slots and scheduled-action identities; v4 adds receipted CRM mutations. Never
 * promote v2/v3 CRM writes: those executors did not commit a per-field receipt. */
export function supportsRecoverableInboundAction(action: TenantAutomationAction, protocol: number) {
  const wait = Number(action.waitInHours || 0);
  if (!Number.isFinite(wait) || wait < 0) return false;
  if (protocol === 4) return supportsAtomicAutomationEffect(action) || action.type === "send_message";
  if (protocol === 3) return atomicInternalTypes.has(action.type) || action.type === "send_message";
  return protocol === 2 && wait === 0 && atomicInternalTypes.has(action.type);
}

/** Shared receipt capability, not an inbound identity or authority grant. */
export function supportsReceiptBackedAutomationAction(action: TenantAutomationAction) {
  return supportsRecoverableInboundAction(action, 4);
}
