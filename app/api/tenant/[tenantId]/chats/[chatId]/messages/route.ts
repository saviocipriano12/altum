import { NextResponse } from "next/server";
import { normalizeInstagramMessageContext } from "@/lib/instagram-message-context";
import { listChatMessages, type MessagePageDirection } from "@/lib/server/conversation-queries";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";
import { decodeConversationCursor, encodeConversationCursor } from "@/lib/server/conversation-pagination";

const MEDIA_TYPES = new Set(["image", "audio", "document", "video"]);

function toTime(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (
    typeof value === "object" &&
    value &&
    "toDate" in value &&
    typeof (value as { toDate?: () => Date }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (
    typeof value === "object" &&
    value &&
    "_seconds" in value &&
    typeof (value as { _seconds?: number })._seconds === "number"
  ) {
    return (value as { _seconds: number })._seconds * 1000;
  }
  return 0;
}

function cleanText(value: unknown, max = 1800) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanMessageText(value: unknown, max = 4000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeReactionUsers(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanText(item, 180)).filter(Boolean).slice(0, 100);
}

function normalizeReactionMap(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([emoji, users]) => [cleanText(emoji, 40), normalizeReactionUsers(users)])
      .filter(([emoji, users]) => emoji && (users as string[]).length > 0)
      .slice(0, 20)
  );
}

function normalizeSender(value: unknown) {
  const sender = cleanText(value, 40).toLowerCase();
  if (sender === "client") return "client";
  if (sender === "system") return "system";
  return "agent";
}

function normalizeMessageType(value: unknown) {
  const type = cleanText(value, 40).toLowerCase();
  if (MEDIA_TYPES.has(type)) return type;
  if (type === "internal_note" || type === "activity" || type === "template") return type;
  return "text";
}

function buildProtectedMediaUrl(tenantId: string, chatId: string, messageId: string, download = false) {
  const base = `/api/tenant/${encodeURIComponent(tenantId)}/chats/${encodeURIComponent(chatId)}/messages/${encodeURIComponent(messageId)}/media`;
  return download ? `${base}?download=1` : base;
}

function inferMediaAvailability(type: string, data: Record<string, unknown>) {
  if (!MEDIA_TYPES.has(type)) {
    return { mediaStatus: "not_applicable" as const, mediaUnavailableReason: null as string | null };
  }

  const hasStoredSource = cleanText(data.mediaUrl, 1800);
  const hasRemoteId = cleanText(data.mediaId, 240) || (data.channel === "whatsapp" && data.channelId && (data.metaMessageId || data.inboundMetaMessageId));
  const hasPreview = cleanText(data.mediaThumbnail, 1800);

  if (hasStoredSource || hasRemoteId || hasPreview) {
    return { mediaStatus: "ready" as const, mediaUnavailableReason: null as string | null };
  }

  if (type === "image") {
    return { mediaStatus: "missing" as const, mediaUnavailableReason: "Imagem sem origem segura disponivel." };
  }
  if (type === "audio") {
    return { mediaStatus: "missing" as const, mediaUnavailableReason: "Audio sem arquivo associado." };
  }
  if (type === "document") {
    return { mediaStatus: "missing" as const, mediaUnavailableReason: "Documento sem arquivo associado." };
  }
  return { mediaStatus: "missing" as const, mediaUnavailableReason: "Midia indisponivel para esta mensagem." };
}

function normalizeTemplateHeaderMedia(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const type = cleanText(data.type, 40).toLowerCase();
  if (type !== "image" && type !== "video" && type !== "document") return null;
  const link = cleanText(data.link, 1800);
  const id = cleanText(data.id, 240);
  if (!link && !id) return null;
  return {
    type,
    link: link || null,
    id: id || null,
    filename: cleanText(data.filename, 240) || null,
  };
}

function messageText(data: Record<string, unknown>) {
  return cleanMessageText(
    data.text || data.message || data.body || data.content || data.caption,
    4000
  );
}

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const url = new URL(req.url);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    assertTenantRole(membership, "client_viewer");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });

    const chatRef = adminDb.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const chat = chatSnap.data() as { tenantId?: string };
    if ((chat.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Chat fora do tenant informado." }, { status: 403 });
    }

    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const pageLimit = Number.isFinite(requestedLimit)
      ? Math.max(25, Math.min(200, Math.round(requestedLimit)))
      : 100;
    const rawDirection = url.searchParams.get("direction");
    const rawCursor = url.searchParams.get("cursor");
    const cursor = rawCursor ? decodeConversationCursor(rawCursor) : null;
    if (rawCursor && !cursor) {
      return NextResponse.json({ error: "Cursor de mensagens invalido.", code: "invalid_cursor" }, { status: 400 });
    }
    const requestedSince = Number(url.searchParams.get("since") || 0);
    const legacySinceMs = Number.isFinite(requestedSince) && requestedSince > 0
      ? Math.max(0, Math.round(requestedSince) - 1_000)
      : null;
    const direction: MessagePageDirection = rawDirection === "older"
      ? "older"
      : rawDirection === "newer" || legacySinceMs
        ? "newer"
        : "initial";
    if (direction !== "initial" && !cursor && !legacySinceMs) {
      return NextResponse.json({ error: "Cursor obrigatorio para paginar mensagens.", code: "cursor_required" }, { status: 400 });
    }

    const ids = Array.from(new Set(url.searchParams.getAll("id")));
    if (ids.length > 100 || ids.some((id) => !id || id.length > 300 || id.includes("/"))) {
      return NextResponse.json({ error: "Identificadores de mensagens invalidos." }, { status: 400 });
    }
    const messagesSnap = ids.length
      ? { docs: await adminDb.getAll(...ids.map((id) => adminDb.collection("messages").doc(id))), size: ids.length }
      : await listChatMessages({ chatId, direction, cursor, legacySinceMs, limit: pageLimit });
    if (messagesSnap.docs.some((doc) => doc.exists && (doc.data()?.tenantId !== tenantId || doc.data()?.chatId !== chatId))) {
      return NextResponse.json({ error: "Mensagem fora da conversa informada." }, { status: 403 });
    }
    const pageDocs = messagesSnap.docs.filter((doc) => doc.exists).slice(0, ids.length || pageLimit);
    const missingIds = ids.length ? messagesSnap.docs.filter((doc) => !doc.exists).map((doc) => doc.id) : [];
    const hasMore = !ids.length && messagesSnap.size > pageLimit;

    const items = pageDocs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const type = normalizeMessageType(data.type);
        const media = inferMediaAvailability(type, data);
        const canRenderMedia = media.mediaStatus === "ready";

        return {
          id: doc.id,
          generation: doc.createTime ? `${String(doc.createTime.seconds).padStart(12, "0")}:${String(doc.createTime.nanoseconds).padStart(9, "0")}` : undefined,
          revision: doc.updateTime ? `${String(doc.updateTime.seconds).padStart(12, "0")}:${String(doc.updateTime.nanoseconds).padStart(9, "0")}` : undefined,
          text: messageText(data),
          sender: normalizeSender(data.sender),
          participantName: cleanText(data.participantName, 180) || null,
          participantJid: cleanText(data.participantJid, 180) || null,
          senderName: cleanText(data.senderName, 180) || cleanText(data.agentName, 180) || null,
          status: cleanText(data.status, 40) || null,
          deliveryStatus: cleanText(data.deliveryStatus, 40) || null,
          deliveryError: cleanText(data.deliveryError, 260) || null,
          createdAt: data.createdAt || null,
          deliveryAt: data.deliveryAt || null,
          deliveryUpdatedAt: data.deliveryUpdatedAt || null,
          type,
          replyToId: cleanText(data.replyToId, 180) || null,
          metaMessageId: cleanText(data.metaMessageId, 240) || null,
          instagramContext: data.channel === "instagram" ? normalizeInstagramMessageContext(data.instagramContext) : null,
          reactions: normalizeReactionMap(data.reactions),
          mediaUrl: canRenderMedia ? buildProtectedMediaUrl(tenantId, chatId, doc.id) : null,
          mediaDownloadUrl: canRenderMedia ? buildProtectedMediaUrl(tenantId, chatId, doc.id, true) : null,
          mediaName: cleanText(data.mediaName, 240) || null,
          mediaMimeType: cleanText(data.mediaMimeType, 180) || null,
          mediaId: cleanText(data.mediaId, 240) || null,
          mediaDuration: numericValue(data.mediaDuration),
          mediaWidth: numericValue(data.mediaWidth),
          mediaHeight: numericValue(data.mediaHeight),
          mediaSize: numericValue(data.mediaSize),
          aiMultimodalSummary: cleanMessageText(data.aiMultimodalSummary, 900) || null,
          mediaThumbnail:
            canRenderMedia && (type === "image" || type === "video")
              ? buildProtectedMediaUrl(tenantId, chatId, doc.id)
              : null,
          mediaStatus: media.mediaStatus,
          mediaUnavailableReason: media.mediaUnavailableReason,
          templateName: cleanText(data.templateName, 240) || null,
          templateLanguage: cleanText(data.templateLanguage, 80) || null,
          templateHeaderMedia: normalizeTemplateHeaderMedia(data.templateHeaderMedia),
        };
      })
      .sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));

    const oldest = items[0] || null;
    const newest = items[items.length - 1] || null;
    const oldestCursor = oldest ? encodeConversationCursor(toTime(oldest.createdAt), oldest.id) : null;
    const newestCursor = newest ? encodeConversationCursor(toTime(newest.createdAt), newest.id) : cursor ? rawCursor : null;
    const nextCursor = direction === "newer" ? newestCursor : oldestCursor;

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId,
      items,
      missingIds,
      direction,
      incremental: direction === "newer",
      limit: pageLimit,
      hasMore,
      nextCursor,
      oldestCursor,
      newestCursor,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao listar mensagens do chat:", error);
    return NextResponse.json({ error: "Falha ao listar mensagens." }, { status: 500 });
  }
}
