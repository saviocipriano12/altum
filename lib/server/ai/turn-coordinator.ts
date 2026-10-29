import { createHash } from "node:crypto";

export const CONVERSATION_TURN_COLLECTION = "ai_conversation_turns_v2";
const DEFAULT_DEBOUNCE_MS = 3_500;
const MAX_DEBOUNCE_MS = 15_000;

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveConversationDebounceMs(input?: {
  source?: string;
  overrideMs?: number;
  configuredMs?: string | number;
}) {
  const source = String(input?.source || "").trim().toLowerCase();
  if (source === "manual_retry" || source === "resume_pending") return 0;

  const requested = finiteNumber(input?.overrideMs);
  const configured = finiteNumber(input?.configuredMs);
  const value = requested ?? configured ?? DEFAULT_DEBOUNCE_MS;
  return Math.min(MAX_DEBOUNCE_MS, Math.max(0, Math.round(value)));
}

export function getConversationTurnDocId(tenantId: string, chatId: string) {
  return `turn_v2_${createHash("sha256").update(JSON.stringify([tenantId, chatId])).digest("hex")}`;
}

export function getLegacyConversationTurnDocId(tenantId: string, chatId: string) {
  const raw = `${tenantId.trim()}_${chatId.trim()}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 440);
}

export function isSupersededConversationTurn(input: {
  jobMessageId: string;
  latestMessageId?: unknown;
}) {
  const latestMessageId = String(input.latestMessageId || "").trim();
  return Boolean(latestMessageId && latestMessageId !== input.jobMessageId.trim());
}

