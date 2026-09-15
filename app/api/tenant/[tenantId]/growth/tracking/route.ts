import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";
import { createPublicWriteKey, normalizeDomains, parseTrackingConfig } from "@/lib/server/growth/tracking";

function jsonError(error: unknown) {
  if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
  console.error("Falha na configuracao de rastreamento:", error);
  return NextResponse.json({ error: "Falha ao configurar o rastreamento." }, { status: 500 });
}

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantRole(membership, "client_viewer");

    const [configSnap, eventsSnap] = await Promise.all([
      adminDb.collection("growth_tracking_configs").doc(tenantId).get(),
      adminDb.collection("growth_events").where("tenantId", "==", tenantId).orderBy("occurredAt", "desc").limit(40).get(),
    ]);
    const configData = configSnap.exists ? configSnap.data() : undefined;
    const config = parseTrackingConfig(configData);
    const events = eventsSnap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name || "",
        occurredAt: data.occurredAt?.toDate?.().toISOString?.() || null,
        path: data.path || "",
        value: Number(data.value || 0),
        currency: data.currency || "BRL",
        source: data.attribution?.source || "",
        campaign: data.attribution?.campaign || "",
      };
    });
    const summary = events.reduce((acc, event) => {
      acc.total += 1;
      if (event.name === "page_view") acc.pageViews += 1;
      if (["form_submitted", "whatsapp_clicked"].includes(event.name)) acc.conversions += 1;
      if (event.name === "purchase_completed") {
        acc.sales += 1;
        acc.revenue += event.value;
      }
      return acc;
    }, { total: 0, pageViews: 0, conversions: 0, sales: 0, revenue: 0 });

    return NextResponse.json({
      config: {
        ...config,
        lastEventAt: configData?.lastEventAt?.toDate?.().toISOString?.() || null,
        lastEventName: configData?.lastEventName || "",
      },
      summary,
      events,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "manage_settings");
    const body = await req.json() as Record<string, unknown>;
    const ref = adminDb.collection("growth_tracking_configs").doc(tenantId);
    const current = await ref.get();
    const currentConfig = parseTrackingConfig(current.data());
    const allowedDomains = normalizeDomains(body.allowedDomains);
    const enabled = body.enabled === true;
    if (enabled && !allowedDomains.length) {
      return NextResponse.json({ error: "Informe ao menos um dominio antes de ativar." }, { status: 400 });
    }
    const next = {
      tenantId,
      enabled,
      allowedDomains,
      consentMode: body.consentMode === "implicit" ? "implicit" : "required",
      publicWriteKey: currentConfig.publicWriteKey || createPublicWriteKey(),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    };
    await ref.set(next, { merge: true });
    return NextResponse.json({ ok: true, config: next });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "marketing");
    assertTenantCapability(membership, "manage_settings");
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    if (body.action !== "rotate_key") return NextResponse.json({ error: "Acao invalida." }, { status: 400 });
    const publicWriteKey = createPublicWriteKey();
    await adminDb.collection("growth_tracking_configs").doc(tenantId).set({
      tenantId,
      publicWriteKey,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: user.uid,
    }, { merge: true });
    return NextResponse.json({ ok: true, publicWriteKey });
  } catch (error) {
    return jsonError(error);
  }
}
