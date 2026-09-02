import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantEntitlements } from "@/lib/server/tenant-entitlements";
import { getTenantCommercialUsage } from "@/lib/server/tenant-usage";
import {
  normalizeTenantEntitlements,
  TENANT_LIMIT_IDS,
  TENANT_MODULE_CATALOG,
  type TenantLimitMap,
  type TenantModuleMap,
} from "@/lib/tenant-entitlements";

type Params = { params: Promise<{ tenantId: string }> };
type Body = { modules?: Partial<TenantModuleMap>; limits?: Partial<TenantLimitMap> };

function clean(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(req: Request, context: Params) {
  try {
    await requireRequestUser(req, { roles: ["agency_owner", "agency_admin", "agency_agent"] });
    const { tenantId } = await context.params;
    const normalizedTenantId = clean(tenantId);
    if (!normalizedTenantId) return NextResponse.json({ error: "Tenant invalido." }, { status: 400 });

    const tenantSnap = await adminDb.collection("tenants").doc(normalizedTenantId).get();
    if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });

    const [entitlements, usage] = await Promise.all([
      getTenantEntitlements(normalizedTenantId),
      getTenantCommercialUsage(normalizedTenantId),
    ]);
    return NextResponse.json({ ok: true, tenantId: normalizedTenantId, entitlements, usage });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao carregar entitlements do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar modulos e limites." }, { status: 500 });
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_owner", "agency_admin"] });
    const { tenantId } = await context.params;
    const normalizedTenantId = clean(tenantId);
    if (!normalizedTenantId) return NextResponse.json({ error: "Tenant invalido." }, { status: 400 });

    const tenantRef = adminDb.collection("tenants").doc(normalizedTenantId);
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) return NextResponse.json({ error: "Tenant nao encontrado." }, { status: 404 });

    const body = (await req.json().catch(() => ({}))) as Body;
    const previous = await getTenantEntitlements(normalizedTenantId);
    const next = normalizeTenantEntitlements(normalizedTenantId, {
      mode: "custom",
      modules: { ...previous.modules, ...(body.modules || {}) },
      limits: { ...previous.limits, ...(body.limits || {}) },
    });

    const ref = adminDb.collection("tenant_entitlements").doc(normalizedTenantId);
    const batch = adminDb.batch();
    batch.set(ref, {
      version: 1,
      tenantId: normalizedTenantId,
      mode: "custom",
      modules: next.modules,
      limits: next.limits,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
      updatedByName: actor.name,
    }, { merge: true });
    batch.set(adminDb.collection("audit_logs").doc(), {
      type: "tenant_entitlements_updated",
      tenantId: normalizedTenantId,
      actorId: actor.uid,
      actorName: actor.name,
      before: { mode: previous.mode, modules: previous.modules, limits: previous.limits },
      after: { mode: "custom", modules: next.modules, limits: next.limits },
      moduleCatalogVersion: 1,
      limitKeys: TENANT_LIMIT_IDS,
      moduleKeys: TENANT_MODULE_CATALOG.map((item) => item.id),
      createdAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();

    return NextResponse.json({ ok: true, tenantId: normalizedTenantId, entitlements: { ...next, isLegacyFallback: false } });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("Erro ao salvar entitlements do tenant:", error);
    return NextResponse.json({ error: "Falha ao salvar modulos e limites." }, { status: 500 });
  }
}
