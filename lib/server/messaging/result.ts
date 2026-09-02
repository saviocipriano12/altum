import type { MessagingProviderId, MessagingResult } from "./types";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function extractExternalMessageId(payload: Record<string, unknown>) {
  const key = payload.key && typeof payload.key === "object" ? payload.key as Record<string, unknown> : {};
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const first = messages[0] && typeof messages[0] === "object"
    ? messages[0] as Record<string, unknown>
    : {};
  return clean(key.id) || clean(payload.messageId) || clean(payload.id) || clean(first.id) || null;
}

export function messagingResult(
  provider: MessagingProviderId,
  payload: Record<string, unknown>,
  mediaId?: string | null
): MessagingResult {
  return {
    provider,
    externalMessageId: extractExternalMessageId(payload),
    ...(mediaId !== undefined ? { mediaId } : {}),
    payload,
  };
}
