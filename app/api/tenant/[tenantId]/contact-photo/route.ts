import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { adminStorage } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import {
  assertTenantAccess,
  assertTenantCapability,
  TenantAccessError,
} from "@/lib/server/tenant";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 6 * 1024 * 1024;

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function publicUrl(bucket: string, path: string, token: string) {
  return `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(path)}?alt=media&token=${encodeURIComponent(token)}`;
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "respond_inbox");

    const bucketName = clean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, 300);
    if (!bucketName) return NextResponse.json({ error: "Storage nao configurado." }, { status: 503 });

    const form = await req.formData();
    const uploaded = form.get("file");
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "Escolha uma imagem." }, { status: 400 });
    }
    const mime = clean(uploaded.type, 120).toLowerCase();
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json({ error: "Envie uma foto JPG, PNG ou WebP." }, { status: 400 });
    }
    if (!uploaded.size || uploaded.size > MAX_BYTES) {
      return NextResponse.json({ error: "A foto deve ter no maximo 6 MB." }, { status: 413 });
    }

    const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const token = randomUUID();
    const path = `contact-photos/${tenantId}/${randomUUID()}.${extension}`;
    await adminStorage.bucket(bucketName).file(path).save(Buffer.from(await uploaded.arrayBuffer()), {
      resumable: false,
      metadata: {
        contentType: mime,
        cacheControl: "public,max-age=31536000",
        metadata: {
          firebaseStorageDownloadTokens: token,
          tenantId,
          uploadedBy: user.uid,
          purpose: "contact_photo",
        },
      },
    });

    return NextResponse.json({ ok: true, photoUrl: publicUrl(bucketName, path, token) });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao subir foto do contato:", error);
    return NextResponse.json({ error: "Falha ao subir foto." }, { status: 500 });
  }
}
