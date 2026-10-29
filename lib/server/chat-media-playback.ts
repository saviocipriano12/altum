import { createHash } from "node:crypto";
import { createMobileAudioRenditions } from "@/lib/server/audio-transcode";
import { findFirebaseStorageFile, saveChatMediaBuffer } from "@/lib/server/firebase-storage";
import { captureMessageMediaSource, assertMessageMediaSource, writeMessageMediaReference, currentMediaReference, assertMediaPathScope, MessageMediaSourceChanged, type MessageMediaSource } from "@/lib/server/message-media-source";
import { TenantAccessError } from "@/lib/server/tenant";

const preparing = new Map<string, Promise<Buffer>>();

/** A browser rendition never replaces the accepted source used by delivery. */
export async function getMessageAudioPlayback(input: {
  tenantId: string; chatId: string; messageId: string; source: Buffer; data: Record<string, unknown>;
  mediaSource?: MessageMediaSource;
}) {
  const mediaSource = input.mediaSource || await captureMessageMediaSource({...input, expectedData: input.data});
  if (mediaSource.tenantId !== input.tenantId || mediaSource.chatId !== input.chatId || mediaSource.messageId !== input.messageId) throw new MessageMediaSourceChanged();
  const current = await assertMessageMediaSource(mediaSource), data = current.message.data()!;
  const hash = createHash("sha256").update(input.source).digest("hex");
  if (currentMediaReference(current.message, "playback") && data.mediaPlaybackSha256 === hash && typeof data.mediaPlaybackUrl === "string") {
    assertMediaPathScope(current, data.mediaPlaybackUrl);
    const file = await findFirebaseStorageFile(data.mediaPlaybackUrl);
    if (file) { const bytes = (await file.download())[0]; await assertMessageMediaSource(current); return bytes; }
  }
  const key = JSON.stringify([input.tenantId, input.chatId, input.messageId, current.message.createTime, current.message.updateTime, current.userId || null, hash]);
  let pending = preparing.get(key);
  if (!pending) {
    pending = (async () => {
      const { playback } = await createMobileAudioRenditions({ source: input.source });
      try {
        const path = await saveChatMediaBuffer({ ...input, data: playback, contentType: "audio/mpeg", filename: "audio.mp3", variant: `playback-${hash.slice(0, 20)}` });
        await writeMessageMediaReference(current, {mediaPlaybackUrl: path, mediaPlaybackSha256: hash}, "playback");
      } catch (error) {
        if (error instanceof MessageMediaSourceChanged || error instanceof TenantAccessError) throw error;
        // The converted bytes are already available; optional caching cannot hide them.
        console.warn("Audio convertido disponível sem cache de reprodução.");
      }
      await assertMessageMediaSource(current);
      return playback;
    })();
    preparing.set(key, pending);
    void pending.finally(() => { if (preparing.get(key) === pending) preparing.delete(key); }).catch(() => undefined);
  }
  const result = await pending;
  await assertMessageMediaSource(current);
  return result;
}
