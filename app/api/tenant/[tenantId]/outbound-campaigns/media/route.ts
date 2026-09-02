import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { firebaseStorageBucketCandidates, saveFirebaseStorageFileWithFallback } from "@/lib/server/firebase-storage";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

const LIMITS = {
  image: 12 * 1024 * 1024,
  video: 64 * 1024 * 1024,
  document: 24 * 1024 * 1024,
};

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function inferType(mime: string) {
  if (mime.startsWith("image/")) return "image" as const;
  if (mime.startsWith("video/")) return "video" as const;
  if (mime === "application/pdf" || mime.startsWith("text/") || mime.includes("document")) return "document" as const;
  return null;
}

function publicUrl(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "manage_automations");

    if (firebaseStorageBucketCandidates().length === 0) {
      return NextResponse.json({ error: "Storage nao configurado." }, { status: 503 });
    }

    const form = await req.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) return NextResponse.json({ error: "Arquivo obrigatorio." }, { status: 400 });

    const mime = clean(uploaded.type, 140).toLowerCase();
    const type = inferType(mime);
    if (!type) return NextResponse.json({ error: "Envie imagem, video ou documento compativel." }, { status: 400 });
    if (!uploaded.size || uploaded.size > LIMITS[type]) {
      return NextResponse.json({ error: `Arquivo acima do limite de ${Math.round(LIMITS[type] / 1024 / 1024)} MB.` }, { status: 413 });
    }

    const safeName = clean(uploaded.name, 180).replace(/[^\w.\- ]+/g, "_") || `arquivo-${Date.now()}`;
    const extension = safeName.match(/\.([a-z0-9]{2,8})$/i)?.[1] || (type === "image" ? "jpg" : type === "video" ? "mp4" : "pdf");
    const token = randomUUID();
    const path = `outbound-media/${tenantId}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
    const { bucketName } = await saveFirebaseStorageFileWithFallback({
      path,
      data: Buffer.from(await uploaded.arrayBuffer()),
      options: {
        resumable: false,
        metadata: {
          contentType: mime || "application/octet-stream",
          cacheControl: "public,max-age=31536000",
          metadata: {
            firebaseStorageDownloadTokens: token,
            tenantId,
            uploadedBy: user.uid,
            purpose: "outbound_campaign",
            originalName: safeName,
          },
        },
      },
    });

    return NextResponse.json({
      ok: true,
      media: {
        type,
        link: publicUrl(bucketName, path, token),
        filename: safeName,
        contentType: mime,
        size: uploaded.size,
        storagePath: path,
      },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao subir midia de disparo:", error);
    return NextResponse.json({ error: "Falha ao subir arquivo." }, { status: 500 });
  }
}
