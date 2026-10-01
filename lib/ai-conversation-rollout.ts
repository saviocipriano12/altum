export type AiConversationRolloutMode = "automatic" | "shadow";

export type AiConversationRollout = {
  mode: AiConversationRolloutMode;
  agentVersion: string;
  rolloutPercent: number;
};

function clean(value: unknown, max = 60) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function clampPercent(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : fallback;
}

/**
 * This intentionally defaults to 100%. Existing tenants must never have their
 * live AI silently disabled when the controlled rollout feature is introduced.
 */
export function normalizeAiConversationRollout(value: unknown): AiConversationRollout {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const mode = clean(raw.mode, 20).toLowerCase() === "shadow" ? "shadow" : "automatic";
  return {
    mode,
    agentVersion: clean(raw.agentVersion, 60) || "conversation-v1",
    rolloutPercent: clampPercent(raw.rolloutPercent, 100),
  };
}

/** Stable per conversation: a contact does not randomly move in and out of a canary. */
export function aiConversationRolloutBucket(key: string) {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

export function decideAiConversationRollout(input: {
  rollout: AiConversationRollout;
  tenantId: string;
  chatId: string;
}) {
  const bucket = aiConversationRolloutBucket(`${input.tenantId}:${input.chatId}`);
  if (input.rollout.mode === "shadow") {
    return { shouldRespond: false, bucket, assignedVersion: input.rollout.agentVersion, reason: "shadow_only" as const };
  }
  if (bucket >= input.rollout.rolloutPercent) {
    return { shouldRespond: false, bucket, assignedVersion: input.rollout.agentVersion, reason: "outside_rollout" as const };
  }
  return { shouldRespond: true, bucket, assignedVersion: input.rollout.agentVersion, reason: "approved" as const };
}
