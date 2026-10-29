/** A bounded chronological transcript, not a 220-character preview of each turn. */
export type ContextTurn = { id: string; text: string; sender: "agent" | "client" | "system"; deliveryStatus?: string | null };
export function selectConversationContext(turns: ContextTurn[], currentMessageId?: string) {
  const candidates = turns.filter(turn => turn.id !== currentMessageId && turn.text.trim() &&
    !(turn.sender === "agent" && /^(sending|queued|failed|pending_confirmation|confirmation_pending|cancelled)$/i.test(turn.deliveryStatus || "")));
  const selected: ContextTurn[] = [];
  let characters = 0;
  for (const turn of candidates.slice(-24).reverse()) {
    const raw = turn.text.replace(/\r/g, "").trim();
    const text = raw.length <= 4000 ? raw : `${raw.slice(0, 1950)}\n[trecho intermediario omitido]\n${raw.slice(-1950)}`;
    if (characters + text.length > 24000) break;
    selected.unshift({ ...turn, text }); characters += text.length;
  }
  return { turns: selected, omittedTurns: candidates.length - selected.length, characters };
}
