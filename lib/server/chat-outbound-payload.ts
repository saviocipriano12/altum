export class ChatOutboundPayloadError extends Error {
  readonly code = "INVALID_OUTBOUND_PAYLOAD";
  constructor(message: string) { super(message); this.name = "ChatOutboundPayloadError"; }
}

/** Reject unsupported text instead of accepting a silently truncated message. */
export function normalizeOutboundText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new ChatOutboundPayloadError("Informe uma mensagem de ate 4000 caracteres.");
  const text = value.trim();
  if (text.length > 4000) throw new ChatOutboundPayloadError("A mensagem excede 4000 caracteres. Reduza o texto antes de enviar.");
  return text;
}

export function normalizeOutboundReplyId(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 180 || /[/\r\n]/.test(value)) {
    throw new ChatOutboundPayloadError("Referencia da mensagem respondida invalida.");
  }
  return value.trim() || null;
}
