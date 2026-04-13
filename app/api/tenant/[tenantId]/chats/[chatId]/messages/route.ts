import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

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
  const hasRemoteId = cleanText(data.mediaId, 240);
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

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const chatRef = adminDb.collection("chats").doc(chatId);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat nao encontrado." }, { status: 404 });
    }

    const chat = chatSnap.data() as { tenantId?: string };
    if ((chat.tenantId || "") !== tenantId) {
      return NextResponse.json({ error: "Chat fora do tenant informado." }, { status: 403 });
    }

    const messagesSnap = await adminDb
      .collection("messages")
      .where("chatId", "==", chatId)
      .limit(500)
      .get();

    const items = messagesSnap.docs
      .map((doc) => {
        const data = doc.data() as Record<string, unknown>;
        const type = normalizeMessageType(data.type);
        const media = inferMediaAvailability(type, data);
        const canRenderMedia = media.mediaStatus === "ready";

        return {
          id: doc.id,
          text: cleanMessageText(data.text, 4000),
          sender: normalizeSender(data.sender),
          createdAt: data.createdAt || null,
          type,
          mediaUrl: canRenderMedia ? buildProtectedMediaUrl(tenantId, chatId, doc.id) : null,
          mediaDownloadUrl: canRenderMedia ? buildProtectedMediaUrl(tenantId, chatId, doc.id, true) : null,
          mediaName: cleanText(data.mediaName, 240) || null,
          mediaMimeType: cleanText(data.mediaMimeType, 180) || null,
          mediaId: cleanText(data.mediaId, 240) || null,
          mediaDuration: numericValue(data.mediaDuration),
          mediaWidth: numericValue(data.mediaWidth),
          mediaHeight: numericValue(data.mediaHeight),
          mediaSize: numericValue(data.mediaSize),
          mediaThumbnail:
            canRenderMedia && (type === "image" || type === "video")
              ? buildProtectedMediaUrl(tenantId, chatId, doc.id)
              : null,
          mediaStatus: media.mediaStatus,
          mediaUnavailableReason: media.mediaUnavailableReason,
        };
      })
      .sort((a, b) => toTime(a.createdAt) - toTime(b.createdAt));

    return NextResponse.json({ ok: true, tenantId, chatId, items });
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
