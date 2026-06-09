import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { firebaseStorageBucketCandidates, saveFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 24 * 1024 * 1024;

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

function clean(value: unknown, max = 180) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function mediaTypeFromMime(mimeType: string) {
  const normalized = clean(mimeType, 140).toLowerCase();
  if (IMAGE_TYPES.has(normalized)) return "image" as const;
  if (VIDEO_TYPES.has(normalized)) return "video" as const;
  if (DOCUMENT_TYPES.has(normalized)) return "document" as const;
  return null;
}

function maxBytesForMediaType(mediaType: "image" | "video" | "document") {
  if (mediaType === "image") return MAX_IMAGE_BYTES;
  if (mediaType === "video") return MAX_VIDEO_BYTES;
  return MAX_DOCUMENT_BYTES;
}

function extensionFromNameOrMime(fileName: string, mimeType: string) {
  const fromName = clean(fileName, 180).toLowerCase().match(/\.([a-z0-9]{2,8})$/)?.[1];
  if (fromName) return fromName;
  if (mimeType.includes("jpeg")) return "jpg";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  if (mimeType.includes("quicktime")) return "mov";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("pdf")) return "pdf";
  if (mimeType.includes("plain")) return "txt";
  if (mimeType.includes("wordprocessingml")) return "docx";
  if (mimeType.includes("spreadsheetml")) return "xlsx";
  if (mimeType.includes("presentationml")) return "pptx";
  return "bin";
}

function safeFileName(value: unknown, fallback: string) {
  return clean(value, 180).replace(/[^\w.\- ]+/g, "_").trim() || fallback;
}

function buildFirebaseDownloadUrl(bucketName: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_ai");

    if (firebaseStorageBucketCandidates().length === 0) {
      return NextResponse.json({ error: "Storage nao configurado no servidor." }, { status: 503 });
    }

    const form = await req.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "Arquivo obrigatorio." }, { status: 400 });
    }

    const mimeType = clean(uploaded.type, 140).toLowerCase() || "application/octet-stream";
    const mediaType = mediaTypeFromMime(mimeType);
    if (!mediaType) {
      return NextResponse.json({ error: "Tipo de arquivo nao permitido para a base da IA." }, { status: 400 });
    }

    const size = uploaded.size;
    const maxBytes = maxBytesForMediaType(mediaType);
    if (!size || size > maxBytes) {
      return NextResponse.json(
        { error: `Arquivo acima do limite permitido (${Math.round(maxBytes / 1024 / 1024)} MB).` },
        { status: 413 }
      );
    }

    const originalName = safeFileName(uploaded.name, `material.${extensionFromNameOrMime("", mimeType)}`);
    const extension = extensionFromNameOrMime(originalName, mimeType);
    const token = randomUUID();
    const path = `kb-media/${tenantId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    const buffer = Buffer.from(await uploaded.arrayBuffer());

    const { bucketName } = await saveFirebaseStorageFileWithFallback({
      path,
      data: buffer,
      options: {
        resumable: false,
        metadata: {
          contentType: mimeType,
          cacheControl: "public,max-age=31536000",
          contentDisposition: `inline; filename="${originalName.replace(/"/g, "")}"`,
          metadata: {
            firebaseStorageDownloadTokens: token,
            tenantId,
            uploadedBy: user.uid,
            originalName,
            purpose: "kb_media",
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      tenantId,
      media: {
        mediaUrl: buildFirebaseDownloadUrl(bucketName, path, token),
        mediaStoragePath: path,
        mediaType,
        mediaMimeType: mimeType,
        mediaSize: size,
        mediaTitle: clean(String(form.get("title") || ""), 160) || originalName,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao subir midia da base de conhecimento:", error);
    return NextResponse.json({ error: "Falha ao subir midia." }, { status: 500 });
  }
}
