import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";

type Body = {
  type?: "faq" | "catalog" | "policy";
  content?: string;
  tags?: string[] | string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaTitle?: string | null;
  mediaStoragePath?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  serviceKey?: string | null;
  productName?: string | null;
  productCategory?: string | null;
  targetProfile?: string | null;
  priceFrom?: number | null;
  priceTo?: number | null;
  upsellKeys?: string[] | string;
  crossSellKeys?: string[] | string;
  priority?: number | null;
  availability?: "active" | "seasonal" | "paused" | string | null;
};

function clean(value: unknown, max = 800) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function parseTags(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item, 60))
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => clean(item, 60))
      .filter(Boolean)
      .slice(0, 20);
  }

  return [] as string[];
}

function parseList(value: unknown, max = 20) {
  if (Array.isArray(value)) {
    return value
      .map((item) => clean(item, 80))
      .filter(Boolean)
      .slice(0, max);
  }
  if (typeof value === "string") {
    return value
      .split(/,|\n|;|\|/)
      .map((item) => clean(item, 80))
      .filter(Boolean)
      .slice(0, max);
  }
  return [] as string[];
}

function normalizeType(value: unknown): "faq" | "catalog" | "policy" {
  const type = String(value || "faq").toLowerCase();
  if (type === "catalog") return "catalog";
  if (type === "policy") return "policy";
  return "faq";
}

function normalizeMediaType(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "image" || normalized === "video" || normalized === "document") return normalized;
  return "";
}

function numericValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function priceValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Number(value)) : null;
}

function normalizeAvailability(value: unknown) {
  const normalized = clean(value, 30).toLowerCase();
  if (normalized === "active" || normalized === "seasonal" || normalized === "paused") return normalized;
  return "active";
}

async function getDocRef(tenantId: string, docId: string) {
  const ref = adminDb.collection("kb_docs").doc(docId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new RouteAuthError(404, "kb_doc_not_found", "Documento nao encontrado.");
  }

  const data = snap.data() as Record<string, unknown>;
  if (String(data.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Documento fora do tenant informado.");
  }

  return ref;
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; docId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, docId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_ai");
    const ref = await getDocRef(tenantId, docId);

    const body = (await req.json()) as Body;
    const content = clean(body.content, 1600);
    if (!content) {
      return NextResponse.json({ error: "Campo obrigatorio: content." }, { status: 400 });
    }

    await ref.set(
      {
        type: normalizeType(body.type),
        content,
        tags: parseTags(body.tags),
        mediaUrl: clean(body.mediaUrl, 1200) || null,
        mediaType: normalizeMediaType(body.mediaType) || null,
        mediaTitle: clean(body.mediaTitle, 160) || null,
        mediaStoragePath: clean(body.mediaStoragePath, 600) || null,
        mediaMimeType: clean(body.mediaMimeType, 140) || null,
        mediaSize: numericValue(body.mediaSize),
        serviceKey: clean(body.serviceKey, 120) || null,
        ...(body.productName !== undefined ? { productName: clean(body.productName, 160) || null } : {}),
        ...(body.productCategory !== undefined ? { productCategory: clean(body.productCategory, 120) || null } : {}),
        ...(body.targetProfile !== undefined ? { targetProfile: clean(body.targetProfile, 180) || null } : {}),
        ...(body.priceFrom !== undefined ? { priceFrom: priceValue(body.priceFrom) } : {}),
        ...(body.priceTo !== undefined ? { priceTo: priceValue(body.priceTo) } : {}),
        ...(body.upsellKeys !== undefined ? { upsellKeys: parseList(body.upsellKeys, 12) } : {}),
        ...(body.crossSellKeys !== undefined ? { crossSellKeys: parseList(body.crossSellKeys, 12) } : {}),
        ...(body.priority !== undefined ? { priority: numericValue(body.priority) } : {}),
        ...(body.availability !== undefined ? { availability: normalizeAvailability(body.availability) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, tenantId, docId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar KB doc:", error);
    return NextResponse.json({ error: "Falha ao atualizar documento." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string; docId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, docId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_ai");
    const ref = await getDocRef(tenantId, docId);

    await ref.delete();
    return NextResponse.json({ ok: true, tenantId, docId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao remover KB doc:", error);
    return NextResponse.json({ error: "Falha ao remover documento." }, { status: 500 });
  }
}
