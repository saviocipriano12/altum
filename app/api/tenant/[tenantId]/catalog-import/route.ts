import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import {
  buildCatalogImportContent,
  catalogImportTags,
  catalogServiceKey,
  normalizeCatalogImportItem,
  type CatalogImportItem,
} from "@/lib/catalog-import";

type Body = { fileName?: unknown; items?: unknown };

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    assertTenantCapability(membership, "manage_ai");

    const body = (await req.json().catch(() => ({}))) as Body;
    const items = (Array.isArray(body.items) ? body.items : [])
      .slice(0, 60)
      .map((item, index) => normalizeCatalogImportItem(item, index))
      .filter((item): item is CatalogImportItem => Boolean(item));
    if (!items.length) {
      return NextResponse.json({ error: "Selecione pelo menos um item válido para publicar." }, { status: 400 });
    }

    const existingSnap = await adminDb.collection("kb_docs").where("tenantId", "==", tenantId).limit(500).get();
    const existingKeys = new Set(existingSnap.docs.map((doc) => {
      const data = doc.data() as Record<string, unknown>;
      return catalogServiceKey(clean(data.serviceKey || data.productName, 180));
    }).filter(Boolean));
    const importId = randomUUID();
    const accepted: CatalogImportItem[] = [];
    const duplicateNames: string[] = [];
    const submittedKeys = new Set<string>();
    for (const item of items) {
      const key = catalogServiceKey(item.name);
      if (!key || existingKeys.has(key) || submittedKeys.has(key)) {
        duplicateNames.push(item.name);
        continue;
      }
      submittedKeys.add(key);
      accepted.push(item);
    }
    if (!accepted.length) {
      return NextResponse.json({
        error: "Todos os itens selecionados já existem no catálogo.",
        duplicates: duplicateNames,
      }, { status: 409 });
    }

    const batch = adminDb.batch();
    const createdIds: string[] = [];
    for (const item of accepted) {
      const ref = adminDb.collection("kb_docs").doc();
      createdIds.push(ref.id);
      batch.set(ref, {
        tenantId,
        type: "catalog",
        content: buildCatalogImportContent(item),
        tags: catalogImportTags(item, importId),
        serviceKey: catalogServiceKey(item.name),
        productName: item.name,
        productCategory: item.category || null,
        targetProfile: item.targetProfile || null,
        priceFrom: item.priceFrom,
        priceTo: item.priceTo,
        upsellKeys: [],
        crossSellKeys: [],
        priority: item.confidence === "high" ? 80 : item.confidence === "medium" ? 60 : 40,
        availability: "active",
        useInAi: true,
        catalogImportId: importId,
        catalogImportFileName: clean(body.fileName, 220) || null,
        createdBy: user.uid,
        createdByName: user.name,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const importRef = adminDb.collection("catalog_imports").doc(importId);
    batch.set(importRef, {
      tenantId,
      fileName: clean(body.fileName, 220) || null,
      status: "published",
      submittedCount: items.length,
      createdCount: accepted.length,
      duplicateCount: duplicateNames.length,
      duplicateNames: duplicateNames.slice(0, 60),
      createdIds,
      createdBy: user.uid,
      createdByName: user.name,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.set(adminDb.collection("audit_logs").doc(), {
      type: "catalog_intelligent_import_published",
      tenantId,
      importId,
      fileName: clean(body.fileName, 220) || null,
      createdCount: accepted.length,
      duplicateCount: duplicateNames.length,
      actorId: user.uid,
      actorName: user.name,
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({
      ok: true,
      importId,
      createdCount: accepted.length,
      duplicateCount: duplicateNames.length,
      duplicates: duplicateNames,
      createdIds,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao publicar importação de catálogo:", error);
    return NextResponse.json({ error: "Falha ao publicar os itens no catálogo." }, { status: 500 });
  }
}
