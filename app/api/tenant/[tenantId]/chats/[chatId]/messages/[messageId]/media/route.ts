import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";
import { downloadWhatsAppMedia, getWhatsAppChannelByPhoneNumberId } from "@/app/lib/server/whatsapp-channel";
import { readEvolutionMessageMedia } from "@/lib/server/messaging/evolution-media-recovery";
import { findFirebaseStorageFile, saveChatMediaBuffer } from "@/lib/server/firebase-storage";
import { getMessageAudioPlayback } from "@/lib/server/chat-media-playback";
import { decodeDataUrl } from "@/lib/server/ai/multimodal";
import { captureMessageMediaSource, assertMessageMediaSource, writeMessageMediaReference, currentMediaReference, assertMediaPathScope, MessageMediaSourceChanged } from "@/lib/server/message-media-source";

export const runtime = "nodejs";
export const maxDuration = 120;
const cleanText = (value: unknown, max = 1800) => typeof value === "string" ? value.trim().slice(0, max) : "";
function filename(value: unknown, messageId: string) {
  return (cleanText(value, 160) || `midia-${messageId}`).replace(/[^a-zA-Z0-9. _-]/g, "_");
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string; messageId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const requestUrl = new URL(req.url);
    const download = requestUrl.searchParams.get("download") === "1";
    const resolveUrl = requestUrl.searchParams.get("resolve") === "1";
    const { tenantId, chatId, messageId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    assertTenantRole(membership, "client_viewer");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });

    const [chatSnap, messageSnap] = await Promise.all([
      adminDb.collection("chats").doc(chatId).get(),
      adminDb.collection("messages").doc(messageId).get(),
    ]);

    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const chatData = chatSnap.data() as { tenantId?: string };
    if ((chatData.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Chat fora do tenant informado." }, { status: 403 });
    }

    if (!messageSnap.exists) {
      return NextResponse.json({ error: "Mensagem nao encontrada." }, { status: 404 });
    }

    const messageData = messageSnap.data() as Record<string, unknown>;
    if (String(messageData.chatId || "") !== chatId || String(messageData.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Mensagem fora do tenant informado." }, { status: 403 });
    }
    let mediaSource = await captureMessageMediaSource({tenantId, chatId, messageId, userId: user.uid, expectedMessage: messageSnap});

    const hint = cleanText(messageData.mediaMimeType, 180) || "application/octet-stream";
    const sourceUrl = currentMediaReference(mediaSource.message, "source") && typeof messageData.mediaUrl === "string" ? messageData.mediaUrl.trim() : "";
    const storedPath = sourceUrl && !/^(https?:|data:)/i.test(sourceUrl) ? sourceUrl : "";
    if (storedPath) assertMediaPathScope(mediaSource, storedPath);
    let storedFile = storedPath ? await findFirebaseStorageFile(storedPath) : null;
    let recoveredMedia: { buffer: Buffer; contentType: string } | null = null;
    if ((!sourceUrl || (!/^(https?:|data:)/i.test(sourceUrl) && !storedFile)) && !messageData.mediaId) {
      recoveredMedia = await readEvolutionMessageMedia({ tenantId, chatId, messageId, data: messageData, source: mediaSource });
    }
    let media: { buffer: Buffer; contentType: string };
    if (recoveredMedia) media = recoveredMedia;
    else if (sourceUrl.startsWith("data:")) media = decodeDataUrl(sourceUrl);
    else if (storedFile) {
      const [bytes] = await storedFile.download(), [metadata] = await storedFile.getMetadata();
      media = { buffer: bytes, contentType: String(metadata.contentType || hint) };
    } else if (/^https?:/i.test(sourceUrl)) {
      const response = await fetch(sourceUrl, { cache: "no-store", signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`media_http_${response.status}`);
      media = { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") || hint };
    } else {
      const mediaId = cleanText(messageData.mediaId, 240), phoneNumberId = cleanText(messageData.channelPhoneNumberId, 180);
      if (!mediaId || !phoneNumberId) return NextResponse.json({ error: "Arquivo indisponível para esta mensagem." }, { status: 404 });
      const channel = await getWhatsAppChannelByPhoneNumberId(phoneNumberId);
      if (!channel || channel.tenantId !== tenantId) return NextResponse.json({ error: "Canal de mídia indisponível." }, { status: 404 });
      media = await downloadWhatsAppMedia({ channel, mediaId });
    }
    if (!media.buffer.length || media.buffer.length > 32 * 1024 * 1024) throw new Error("media_size_invalid");
    if (media.contentType.split(";")[0] === "application/octet-stream" && hint !== "application/octet-stream") media.contentType = hint;
    if (!storedFile) {
      try {
        const path = await saveChatMediaBuffer({ tenantId, chatId, messageId, data: media.buffer, contentType: media.contentType, filename: filename(messageData.mediaName, messageId) });
        storedFile = await findFirebaseStorageFile(path);
        mediaSource = await writeMessageMediaReference(mediaSource, {
            mediaUrl: path, mediaMimeType: media.contentType, mediaSize: media.buffer.length,
          }, "source");
      } catch (error) {
        if (error instanceof MessageMediaSourceChanged || error instanceof TenantAccessError) throw error;
        console.warn("Arquivo disponível sem cache de mídia.");
      }
    }
    let playback = false;
    if (String(messageData.type) === "audio" && /^audio\/(ogg|webm)(;|$)/i.test(media.contentType)) {
      try {
        media = { buffer: await getMessageAudioPlayback({ tenantId, chatId, messageId, source: media.buffer, data: messageData, mediaSource }), contentType: "audio/mpeg" };
        playback = true;
      } catch (error) {
        if (error instanceof MessageMediaSourceChanged || error instanceof TenantAccessError) throw error;
        console.warn("Conversão de áudio indisponível; preservando arquivo original.");
      }
    }
    const name = playback ? filename(messageData.mediaName, messageId).replace(/(?:\.[a-z0-9]{1,8})?$/i, ".mp3") : filename(messageData.mediaName, messageId);
    // Keep resolve=1 compatible for existing consumers; the conversation itself uses authenticated bytes.
    if (resolveUrl && playback) {
      const refreshed = await assertMessageMediaSource(mediaSource);
      const path = refreshed.message.data()?.mediaPlaybackUrl;
      if (typeof path === "string") assertMediaPathScope(refreshed, path);
      storedFile = currentMediaReference(refreshed.message, "playback") && typeof path === "string" ? await findFirebaseStorageFile(path) : null;
    }
    if (resolveUrl && storedFile) {
      await assertMessageMediaSource(mediaSource);
      const [url] = await storedFile.getSignedUrl({ action: "read", expires: Date.now() + 600000,
        responseType: media.contentType, responseDisposition: `${download ? "attachment" : "inline"}; filename="${name}"` });
      await assertMessageMediaSource(mediaSource);
      return NextResponse.json({ ok: true, url, contentType: media.contentType, expiresInSeconds: 600 });
    }
    await assertMessageMediaSource(mediaSource);
    return new NextResponse(new Uint8Array(media.buffer), { headers: {
      "Content-Type": media.contentType, "Content-Length": String(media.buffer.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store", "Vary": "Authorization", "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) {
    if (error instanceof MessageMediaSourceChanged) return NextResponse.json({error: error.message, code: error.code}, {status: 409});
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao carregar mídia da mensagem:", error);
    return NextResponse.json({ error: "Não foi possível carregar o arquivo. Tente novamente." }, { status: 500 });
  }
}
