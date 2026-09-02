import { after, NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { assertChatCommercialAccess } from "@/lib/server/commercial-access";
import { assertTenantStorageAvailable, TenantUsageLimitError } from "@/lib/server/tenant-usage";
import { firebaseStorageBucketCandidates } from "@/lib/server/firebase-storage";
import { adminStorage } from "@/app/lib/server/firebase-admin";
import { processChatOutboundJobs, queueTenantChatMedia } from "@/lib/server/chat-outbound";
import type { ChatMediaType } from "@/lib/server/chat-dispatch";

// A Evolution precisa baixar o video da URL temporaria antes de entregar ao
// WhatsApp. A rota nao deve encerrar nos 20–30 segundos tipicos de texto.
export const maxDuration = 120;

const MEDIA_LIMITS: Record<ChatMediaType, number> = {
  image: 8 * 1024 * 1024,
  video: 32 * 1024 * 1024,
  audio: 16 * 1024 * 1024,
  document: 24 * 1024 * 1024,
};

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function normalizeMediaType(value: unknown): ChatMediaType | null {
  const type = clean(value, 30).toLowerCase();
  return type === "image" || type === "video" || type === "audio" || type === "document" ? type : null;
}

function typeMatches(mediaType: ChatMediaType, contentType: string) {
  const normalized = contentType.toLowerCase().split(";")[0].trim();
  if (mediaType === "image") return normalized.startsWith("image/");
  if (mediaType === "video") return normalized.startsWith("video/");
  if (mediaType === "audio") return normalized.startsWith("audio/");
  return !normalized.startsWith("image/") && !normalized.startsWith("video/") && !normalized.startsWith("audio/");
}

async function resolveUploadedFile(storagePath: string) {
  for (const bucketName of firebaseStorageBucketCandidates()) {
    const file = adminStorage.bucket(bucketName).file(storagePath);
    const [exists] = await file.exists();
    if (exists) return { bucketName, file };
  }
  return null;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string; chatId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, chatId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "inbox");
    await assertTenantModule(tenantId, "whatsapp");
    assertTenantCapability(membership, "respond_inbox");
    await assertChatCommercialAccess({ membership, userId: user.uid, tenantId, chatId });

    const body = (await req.json()) as Record<string, unknown>;
    const storagePath = clean(body.storagePath, 900);
    const mediaType = normalizeMediaType(body.mediaType);
    const filename = clean(body.filename, 180) || `arquivo-${Date.now()}`;
    const caption = clean(body.caption, 1024);
    const replyToId = clean(body.replyToId, 180) || null;
    const expectedPrefix = `chat-media/${tenantId}/${chatId}/${user.uid}/`;

    if (!storagePath || !mediaType || storagePath.includes("..") || !storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: "Arquivo enviado nao pertence a esta conversa." }, { status: 400 });
    }

    const resolved = await resolveUploadedFile(storagePath);
    if (!resolved) {
      return NextResponse.json({ error: "Upload nao encontrado. Envie o arquivo novamente." }, { status: 404 });
    }

    const [metadata] = await resolved.file.getMetadata();
    const size = Math.max(0, Number(metadata.size || 0));
    const contentType = clean(metadata.contentType, 180) || "application/octet-stream";
    if (!size) {
      return NextResponse.json({ error: "O arquivo enviado esta vazio." }, { status: 400 });
    }
    if (size > MEDIA_LIMITS[mediaType]) {
      return NextResponse.json(
        { error: `Arquivo muito grande. Limite para ${mediaType}: ${Math.round(MEDIA_LIMITS[mediaType] / 1024 / 1024)}MB.` },
        { status: 400 }
      );
    }
    if (!typeMatches(mediaType, contentType)) {
      return NextResponse.json({ error: "O formato do arquivo nao corresponde ao tipo informado." }, { status: 400 });
    }

    await assertTenantStorageAvailable(tenantId, size);
    const queued = await queueTenantChatMedia({
      tenantId,
      chatId,
      mediaType,
      storagePath,
      mediaSize: size,
      filename,
      contentType,
      caption,
      replyToId,
      actor: { id: user.uid, name: user.name },
    });
    after(() => processChatOutboundJobs({ jobId: queued.jobId, limit: 1 }).catch((error) => {
      console.error("Falha no envio assincrono de midia:", error);
    }));

    return NextResponse.json({ ok: true, ...queued, mediaType });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    if (error instanceof TenantUsageLimitError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao enviar midia armazenada:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Falha ao enviar midia." },
      { status: 500 }
    );
  }
}
