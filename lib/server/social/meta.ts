import type { MetaConversationChannelType } from "@/app/lib/server/meta-channel";

export type ParsedMetaSocialEventType = "comment" | "new_follower";

export type ParsedMetaSocialEvent = {
  eventId: string;
  eventType: ParsedMetaSocialEventType;
  channelType: MetaConversationChannelType;
  entryId: string;
  actorId: string;
  actorName: string;
  actorUsername: string;
  text: string;
  commentId?: string | null;
  postId?: string | null;
  parentId?: string | null;
  timestamp: number | null;
  field: string;
};

function cleanText(value: unknown, max = 320) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildCommentEventId(entryId: string, field: string, commentId: string, timestamp: number | null) {
  return `${entryId}:${field}:${commentId}:${timestamp || "0"}`;
}

function normalizeActor(value: unknown) {
  const actor = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    id: cleanText(actor.id, 180) || cleanText(actor.user_id, 180) || cleanText(actor.from_id, 180),
    name: cleanText(actor.name, 180) || cleanText(actor.username, 180),
    username: cleanText(actor.username, 180),
  };
}

export function parseMetaSocialEvents(body: Record<string, unknown>) {
  const objectType = cleanText(body.object, 40).toLowerCase();
  const channelType: MetaConversationChannelType = objectType === "instagram" ? "instagram" : "messenger";
  const entries = Array.isArray(body.entry) ? body.entry : [];
  const parsed: ParsedMetaSocialEvent[] = [];

  for (const entryRaw of entries) {
    const entry = entryRaw && typeof entryRaw === "object" ? (entryRaw as Record<string, unknown>) : {};
    const entryId = cleanText(entry.id, 180);
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const changeRaw of changes) {
      const change = changeRaw && typeof changeRaw === "object" ? (changeRaw as Record<string, unknown>) : {};
      const field = cleanText(change.field, 80).toLowerCase();
      const value = change.value && typeof change.value === "object" ? (change.value as Record<string, unknown>) : {};
      const actor = normalizeActor(value.from || value.sender || value.actor || value.follower);
      const timestamp =
        cleanNumber(value.created_time) ??
        cleanNumber(value.timestamp) ??
        cleanNumber(change.time);

      const looksLikeComment =
        field === "comments" ||
        (field === "feed" && cleanText(value.item, 40).toLowerCase() === "comment");

      if (looksLikeComment) {
        const verb = cleanText(value.verb, 40).toLowerCase();
        const commentId = cleanText(value.comment_id, 180) || cleanText(value.id, 180);
        if (!entryId || !actor.id || !commentId || (verb && verb !== "add" && verb !== "created")) {
          continue;
        }

        parsed.push({
          eventId: buildCommentEventId(entryId, field, commentId, timestamp),
          eventType: "comment",
          channelType,
          entryId,
          actorId: actor.id,
          actorName: actor.name || actor.username || `Perfil ${actor.id.slice(-6)}`,
          actorUsername: actor.username,
          text: cleanText(value.message, 1500) || cleanText(value.text, 1500),
          commentId,
          postId: cleanText(value.post_id, 180) || cleanText(value.media_id, 180) || null,
          parentId: cleanText(value.parent_id, 180) || null,
          timestamp,
          field,
        });
        continue;
      }

      const looksLikeFollower =
        field === "followers" ||
        cleanText(value.item, 40).toLowerCase() === "follow" ||
        cleanText(value.verb, 40).toLowerCase() === "follow";

      if (looksLikeFollower && entryId && actor.id) {
        parsed.push({
          eventId: `${entryId}:${field || "follow"}:${actor.id}:${timestamp || "0"}`,
          eventType: "new_follower",
          channelType,
          entryId,
          actorId: actor.id,
          actorName: actor.name || actor.username || `Perfil ${actor.id.slice(-6)}`,
          actorUsername: actor.username,
          text: "",
          timestamp,
          field,
        });
      }
    }
  }

  return parsed;
}
