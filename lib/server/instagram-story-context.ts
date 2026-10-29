import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { type MetaChannelConfig } from "@/app/lib/server/meta-channel";
import { normalizeInstagramMessageContext, type InstagramMessageContext } from "@/lib/instagram-message-context";

export async function resolveInstagramStoryContext(channel: MetaChannelConfig, original: InstagramMessageContext) {
  if (channel.type !== "instagram" || original.kind !== "story_reply" || !/^\d{1,80}$/.test(original.storyId || "")) return original;
  const url = new URL(`https://graph.facebook.com/${process.env.META_GRAPH_VERSION?.trim() || "v21.0"}/${original.storyId}`);
  url.searchParams.set("fields", "id,media_type,media_url,thumbnail_url,permalink,owner");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${channel.accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
  const data = await response.json() as { id?: string; owner?: { id?: string }; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string };
  if (!response.ok || data.id !== original.storyId || !channel.externalAccountId || data.owner?.id !== channel.externalAccountId) return original;
  if (data.media_type !== "IMAGE" && data.media_type !== "VIDEO") return original;
  return normalizeInstagramMessageContext({ ...original, mediaType: data.media_type,
    mediaUrl: data.media_url, previewUrl: data.media_type === "VIDEO" ? data.thumbnail_url : data.media_url,
    permalink: data.permalink }) || original;
}

/** Enrich existing message context only. No new messages, AI or automations. */
export async function refreshInstagramStoryMessage(input: { channel: MetaChannelConfig; chatId: string; messageId: string; force?: boolean }) {
  const ref = adminDb.collection("messages").doc(input.messageId);
  const snapshot = await ref.get(), data = snapshot.data();
  if (!data || data.tenantId !== input.channel.tenantId || data.chatId !== input.chatId || data.channelId !== input.channel.id || data.channel !== "instagram") throw new Error("instagram_story_message_scope_invalid");
  const original = normalizeInstagramMessageContext(data.instagramContext);
  if (!original) return null;
  const checked = data.instagramStoryResolvedAt?.toMillis?.() || 0;
  if (!input.force && original.mediaType && (original.previewUrl || original.mediaUrl) && checked > Date.now() - 120_000) return original;
  const enriched = await resolveInstagramStoryContext(input.channel, original);
  if (!enriched.mediaType || enriched === original) return enriched;
  await adminDb.runTransaction(async tx => {
    const [current, chat, channel] = await Promise.all([tx.get(ref), tx.get(adminDb.collection("chats").doc(input.chatId)), tx.get(adminDb.collection("tenant_channels").doc(input.channel.id))]);
    if (current.data()?.tenantId !== input.channel.tenantId || current.data()?.chatId !== input.chatId || current.data()?.channelId !== input.channel.id ||
      current.data()?.instagramContext?.storyId !== original.storyId || chat.data()?.tenantId !== input.channel.tenantId || chat.data()?.channelId !== input.channel.id ||
      channel.data()?.tenantId !== input.channel.tenantId || channel.data()?.status !== "active" || channel.data()?.externalAccountId !== input.channel.externalAccountId) throw new Error("instagram_story_scope_changed");
    tx.update(ref, { instagramContext: enriched, instagramStoryResolvedAt: FieldValue.serverTimestamp() });
  });
  return enriched;
}
