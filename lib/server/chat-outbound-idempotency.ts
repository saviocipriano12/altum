import { createHash, randomUUID } from "node:crypto";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export class ChatOutboundIdempotencyError extends Error {
  readonly code = "OUTBOUND_IDEMPOTENCY_CONFLICT";

  constructor() {
    super("Esta identificacao de envio ja foi usada com outro conteudo.");
    this.name = "ChatOutboundIdempotencyError";
  }
}

export class ChatOutboundRequestIdError extends Error {
  readonly code = "INVALID_OUTBOUND_REQUEST_ID";
  constructor() {
    super("clientRequestId invalido.");
    this.name = "ChatOutboundRequestIdError";
  }
}

export function normalizeChatOutboundRequestId(value?: unknown) {
  if (value != null && typeof value !== "string") throw new ChatOutboundRequestIdError();
  // Keep legacy omission/blank behavior, but never truncate a supplied key:
  // two long keys sharing a prefix must not silently become one operation.
  const normalized = (typeof value === "string" ? value.trim() : "") || randomUUID();
  if (!/^[A-Za-z0-9._:-]{8,180}$/.test(normalized)) {
    throw new ChatOutboundRequestIdError();
  }
  return normalized;
}

export function createChatOutboundIdentity(input: {
  tenantId: string;
  chatId: string;
  clientRequestId: string;
}) {
  const tenantId = clean(input.tenantId, 180);
  const chatId = clean(input.chatId, 180);
  const clientRequestId = normalizeChatOutboundRequestId(input.clientRequestId);
  if (!tenantId || !chatId) throw new Error("tenantId e chatId sao obrigatorios.");
  const hash = createHash("sha256")
    .update(JSON.stringify(["chat-outbound-v1", tenantId, chatId, clientRequestId]))
    .digest("hex")
    .slice(0, 48);
  return { clientRequestId, jobId: `outbox_${hash}`, messageId: `out_${hash}` };
}

export function createChatOutboundFingerprint(parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}
