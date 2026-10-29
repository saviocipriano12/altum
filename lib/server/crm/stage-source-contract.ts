/** Business origins share effect/receipt machinery, never their authority. */
const sourceTypes = {
  proposal: "crm_proposal_mutation",
  order: "crm_order_stage_transition",
  manual: "crm_manual_stage_transition",
  intake: "crm_lead_created_occurrence",
  finance: "crm_finance_paid_occurrence",
  billing: "asaas_billing_paid_occurrence",
  financeStage: "crm_finance_stage_transition",
  conversation: "crm_conversation_stage_transition",
  aiSignal: "crm_ai_signal_occurrence",
  socialEvent: "crm_social_event_occurrence",
  waiting: "automation_waiting_reply_runtime",
} as const;
export type StageAutomationSourceKind = keyof typeof sourceTypes;
export function isStageAutomationSourceKind(value: unknown): value is StageAutomationSourceKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(sourceTypes, value);
}
export function stageAutomationSourceType(value: unknown) {
  return isStageAutomationSourceKind(value) ? sourceTypes[value] : null;
}
export function stageAutomationSourceKindForType(value: unknown): StageAutomationSourceKind | null {
  return (Object.keys(sourceTypes) as StageAutomationSourceKind[]).find(kind => sourceTypes[kind] === value) || null;
}
export function businessAutomationTrigger(kind: unknown) {
  return !isStageAutomationSourceKind(kind) ? null : kind === "waiting" ? "waiting_for_reply" : kind === "socialEvent" ? "message_received" : kind === "aiSignal" ? "ai_next_action" : kind === "intake" ? "lead_created" : kind === "finance" || kind === "billing" ? "finance_paid" : "lead_stage_changed";
}
