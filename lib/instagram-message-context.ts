export type InstagramMessageContext = {
  kind: "story_reply" | "story_mention" | "message_reply";
  storyId: string | null;
  previewUrl: string | null;
  messageId: string | null;
  text: string | null;
  mediaType?: "IMAGE" | "VIDEO";
  mediaUrl?: string | null;
  permalink?: string | null;
};

export function instagramStoryPresentation(context: InstagramMessageContext, legacyVideo = false) {
  const video = Boolean(context.mediaType === "VIDEO" && context.mediaUrl) || legacyVideo;
  const src = video ? context.mediaUrl || context.previewUrl : context.previewUrl;
  return { kind: video ? "video" as const : "image" as const, src,
    poster: video && context.previewUrl && context.previewUrl !== src ? context.previewUrl : undefined };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function clean(value: unknown, max = 240) {
  return typeof value === "string" ? value.trim().slice(0, max) || null : null;
}

function mediaUrl(value: unknown) {
  const raw = clean(value, 8000);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const allowed = ["fbcdn.net", "fbsbx.com", "cdninstagram.com", "instagram.com", "facebook.com"];
    return url.protocol === "https:" && !url.username && !url.password &&
      allowed.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`)) ? raw : null;
  } catch { return null; }
}

export function normalizeInstagramMessageContext(value: unknown): InstagramMessageContext | null {
  const data = record(value);
  if (!["story_reply", "story_mention", "message_reply"].includes(String(data.kind))) return null;
  return {
    kind: data.kind as InstagramMessageContext["kind"],
    storyId: clean(data.storyId), previewUrl: mediaUrl(data.previewUrl),
    messageId: clean(data.messageId), text: clean(data.text, 1200),
    ...(data.mediaType === "IMAGE" || data.mediaType === "VIDEO" ? { mediaType: data.mediaType } : {}),
    ...(data.mediaUrl !== undefined ? { mediaUrl: mediaUrl(data.mediaUrl) } : {}),
    ...(data.permalink !== undefined ? { permalink: instagramPermalink(data.permalink) } : {}),
  };
}

function instagramPermalink(value: unknown) {
  try { const url = new URL(clean(value, 2000) || "");
    return url.protocol === "https:" && !url.username && !url.password &&
      ["instagram.com", "www.instagram.com"].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function extractInstagramMessageContext(message: Record<string, unknown>): InstagramMessageContext | null {
  const reply = record(message.reply_to);
  const story = record(reply.story);
  if (Object.keys(story).length) {
    return normalizeInstagramMessageContext({ kind: "story_reply", storyId: story.id, previewUrl: story.url });
  }
  const mention = (Array.isArray(message.attachments) ? message.attachments : []).map(record)
    .find((attachment) => attachment.type === "story_mention");
  if (mention) {
    const payload = record(mention.payload);
    return normalizeInstagramMessageContext({ kind: "story_mention", storyId: payload.id, previewUrl: payload.url });
  }
  const messageId = clean(reply.mid || reply.message_id);
  return messageId ? normalizeInstagramMessageContext({ kind: "message_reply", messageId, text: reply.text }) : null;
}
