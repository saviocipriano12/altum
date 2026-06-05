import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { sendTenantChatMedia, type ChatMediaType } from "@/lib/server/chat-dispatch";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 32 * 1024 * 1024;
const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 24 * 1024 * 1024;

function clean(value: unknown, max = 240) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function inferMediaType(file: File): ChatMediaType {
  const mime = clean(file.type, 180).toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "document";
}

function maxBytesFor(type: ChatMediaType) {
  if (type === "image") return MAX_IMAGE_BYTES;
  if (type === "video") return MAX_VIDEO_BYTES;
  if (type === "audio") return MAX_AUDIO_BYTES;
  return MAX_DOCUMENT_BYTES;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "respond_inbox");

    const form = await req.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "Arquivo obrigatorio." }, { status: 400 });
    }

    const mediaType = inferMediaType(uploaded);
    const maxBytes = maxBytesFor(mediaType);
    if (uploaded.size <= 0) {
      return NextResponse.json({ error: "Arquivo vazio." }, { status: 400 });
    }
    if (uploaded.size > maxBytes) {
      return NextResponse.json(
        { error: `Arquivo muito grande para ${mediaType}. Limite: ${Math.round(maxBytes / 1024 / 1024)}MB.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer());
    const result = await sendTenantChatMedia({
      tenantId,
      chatId,
      mediaType,
      buffer,
      filename: clean(uploaded.name, 180) || `arquivo-${Date.now()}`,
      contentType: clean(uploaded.type, 180) || "application/octet-stream",
      caption: clean(form.get("caption"), 1024),
      actor: { id: user.uid, name: user.name },
      pauseAi: true,
      pauseMinutes: 30,
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      chatId,
      channel: result.channel,
      phoneNumberId: result.phoneNumberId,
      metaMessageId: result.metaMessageId,
      mediaId: result.mediaId,
      mediaType: result.mediaType,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao enviar midia do tenant:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar midia." },
      { status: 500 }
    );
  }
}
