export type ConversationCursor = {
  version: 1;
  timestampMs: number;
  documentId: string;
};

function cleanDocumentId(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 300) : "";
}

export function encodeConversationCursor(timestampMs: number, documentId: string) {
  const normalizedTimestamp = Math.max(0, Math.round(Number(timestampMs) || 0));
  const normalizedDocumentId = cleanDocumentId(documentId);
  if (!normalizedTimestamp || !normalizedDocumentId) return null;
  const payload: ConversationCursor = {
    version: 1,
    timestampMs: normalizedTimestamp,
    documentId: normalizedDocumentId,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeConversationCursor(value: unknown): ConversationCursor | null {
  if (typeof value !== "string" || !value.trim() || value.length > 1000) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ConversationCursor>;
    const timestampMs = Math.round(Number(parsed.timestampMs));
    const documentId = cleanDocumentId(parsed.documentId);
    if (parsed.version !== 1 || !Number.isFinite(timestampMs) || timestampMs <= 0 || !documentId) return null;
    return { version: 1, timestampMs, documentId };
  } catch {
    return null;
  }
}

