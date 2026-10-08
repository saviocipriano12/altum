/** Pure policy for the global admin render lifecycle. No provider calls. */
export type RenderOutcome = { status: "submitted" | "completed"; providerStatusUrl: string | null; assetUrl: string | null };
export function classifyPlatformRender(outcome: RenderOutcome, previousStatusUrl: string | null, stored: boolean): "submitted" | "completed" | "needs_reconciliation" {
  if (outcome.status === "submitted" && !(outcome.providerStatusUrl || previousStatusUrl)) return "needs_reconciliation";
  if (outcome.status === "completed" && (!outcome.assetUrl || !stored)) return "needs_reconciliation";
  return outcome.status;
}
