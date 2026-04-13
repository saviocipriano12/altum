import { NextResponse } from "next/server";
import { adminDb, adminStorage } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  downloadWhatsAppMedia,
  getWhatsAppChannelByPhoneNumberId,
} from "@/app/lib/server/whatsapp-channel";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

function cleanText(value: unknown, max = 1800) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function storageBucketName() {
  return String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "").trim();
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

async function fetchRemoteMedia(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`media_http_${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: response.headers.get("content-type") || "application/octet-stream",
    size: Number(response.headers.get("content-length") || 0) || null,
  };
}

async function fetchStorageMedia(path: string) {
  const bucketName = storageBucketName();
  if (!bucketName) {
    throw new Error("storage_bucket_missing");
  }

  const file = adminStorage.bucket(bucketName).file(path);
  const [buffer] = await file.download();
  const [metadata] = await file
    .getMetadata()
    .catch(() => [{ contentType: "application/octet-stream", size: "0" }]);

  return {
    buffer,
    contentType: String(metadata.contentType || "application/octet-stream"),
    size: Number(metadata.size || 0) || null,
  };
}

function extensionFromMimeType(mimeType: string) {
  const normalized = cleanText(mimeType, 120).toLowerCase();
  if (normalized.includes("jpeg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  if (normalized.includes("ogg")) return "ogg";
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("mp4")) return "mp4";
  if (normalized.includes("pdf")) return "pdf";
  if (normalized.includes("plain")) return "txt";
  return "bin";
}

function safeFileName(value: unknown, fallback: string) {
  const cleaned = cleanText(value, 140).replace(/[^\w.\- ]+/g, "_").trim();
  return cleaned || fallback;
}

function buildDownloadName(messageId: string, mediaName: unknown, mimeType: string) {
  const extension = extensionFromMimeType(mimeType);
  const fallback = `midia-${messageId}.${extension}`;
  const provided = safeFileName(mediaName, fallback);
  if (/\.[a-z0-9]{2,6}$/i.test(provided)) return provided;
  return `${provided}.${extension}`;
}

async function cacheMediaInStorage(input: {
  tenantId: string;
  chatId: string;
  messageId: string;
  buffer: Buffer;
  contentType: string;
}) {
  const bucketName = storageBucketName();
  if (!bucketName) return null;

  const extension = extensionFromMimeType(input.contentType);
  const path = `chat-media/${input.tenantId}/${input.chatId}/${input.messageId}.${extension}`;
  const file = adminStorage.bucket(bucketName).file(path);

  await file.save(input.buffer, {
    metadata: {
      contentType: input.contentType,
      cacheControl: "public,max-age=31536000",
    },
    resumable: false,
  });

  return path;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string; messageId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const download = new URL(req.url).searchParams.get("download") === "1";
    const { tenantId, chatId, messageId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

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

    const directMediaUrl = cleanText(messageData.mediaUrl, 1800);
    const contentTypeHint =
      cleanText(messageData.mediaMimeType, 180) || "application/octet-stream";

    let media:
      | {
          buffer: Buffer;
          contentType: string;
          size?: number | null;
        }
      | null = null;

    if (directMediaUrl) {
      media = isHttpUrl(directMediaUrl)
        ? await fetchRemoteMedia(directMediaUrl)
        : await fetchStorageMedia(directMediaUrl);
    } else {
      const mediaId = cleanText(messageData.mediaId, 240);
      const channelPhoneNumberId = cleanText(messageData.channelPhoneNumberId, 180);
      if (!mediaId || !channelPhoneNumberId) {
        return NextResponse.json({ error: "Midia indisponivel para esta mensagem." }, { status: 404 });
      }

      const channel = await getWhatsAppChannelByPhoneNumberId(channelPhoneNumberId);
      if (!channel || channel.tenantId !== tenantId) {
        return NextResponse.json({ error: "Canal de midia indisponivel." }, { status: 404 });
      }

      media = await downloadWhatsAppMedia({
        channel,
        mediaId,
      });

      const cachedPath = await cacheMediaInStorage({
        tenantId,
        chatId,
        messageId,
        buffer: media.buffer,
        contentType: media.contentType,
      });

      if (cachedPath) {
        await messageSnap.ref.set(
          {
            mediaUrl: cachedPath,
            mediaMimeType: media.contentType || contentTypeHint,
            mediaSize: media.size ?? null,
            updatedAt: new Date(),
          },
          { merge: true }
        );
      }
    }

    if (!media) {
      return NextResponse.json({ error: "Falha ao carregar midia." }, { status: 500 });
    }

    const fileName = buildDownloadName(messageId, messageData.mediaName, media.contentType || contentTypeHint);
    const disposition = download ? "attachment" : "inline";

    if ((media.size ?? null) && !numericValue(messageData.mediaSize)) {
      await messageSnap.ref.set(
        {
          mediaSize: media.size,
          mediaMimeType: media.contentType || contentTypeHint,
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    return new NextResponse(new Uint8Array(media.buffer), {
      status: 200,
      headers: {
        "Content-Type": media.contentType || contentTypeHint,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar midia da mensagem:", error);
    return NextResponse.json({ error: "Falha ao carregar midia." }, { status: 500 });
  }
}
