/** Explicit malformed selections never borrow a legacy worker's authority. */
export function aiCommercialSelectionId(chat: Record<string, unknown> | undefined): string | null {
  if (chat?.commercialContext === undefined) return null;
  const context = chat.commercialContext;
  if (!context || typeof context !== "object" || Array.isArray(context)) return "invalid_selection";
  const row = context as Record<string, unknown>;
  return row.version === 1 && typeof row.id === "string" && /^context_[a-f0-9]{64}$/.test(row.id) ? row.id : "invalid_selection";
}
