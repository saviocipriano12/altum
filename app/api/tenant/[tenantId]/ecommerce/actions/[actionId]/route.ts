import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, hasTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function normalizeStatus(value: unknown) {
  const normalized = clean(value, 40).toLowerCase();
  if (normalized === "done" || normalized === "dismissed" || normalized === "pending") return normalized;
  return "";
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; actionId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, actionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "commerce");
    if (!hasTenantCapability(membership, "edit_leads") && !hasTenantCapability(membership, "manage_channels")) {
      throw new TenantAccessError("tenant_capability_denied", "Perfil sem capacidade para esta operacao.");
    }

    const body = (await req.json()) as { status?: string };
    const status = normalizeStatus(body.status);
    if (!status) return NextResponse.json({ error: "Status invalido." }, { status: 400 });

    const ref = adminDb.collection("ecommerce_commercial_actions").doc(clean(actionId, 180));
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Acao nao encontrada." }, { status: 404 });
    const data = snap.data() as Record<string, unknown>;
    if (clean(data.tenantId, 180) !== tenantId) {
      return NextResponse.json({ error: "Acao fora do tenant informado." }, { status: 403 });
    }

    await ref.set(
      {
        status,
        resolvedAt: status === "done" || status === "dismissed" ? FieldValue.serverTimestamp() : null,
        resolvedBy: status === "done" || status === "dismissed" ? user.uid : null,
        resolvedByName: status === "done" || status === "dismissed" ? user.name : null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    const leadId = clean(data.leadId, 180);
    if (leadId && status !== "pending") {
      await adminDb.collection("leads").doc(leadId).collection("events").add({
        type: "ecommerce_action_status",
        title: status === "done" ? "Acao ecommerce concluida" : "Acao ecommerce ignorada",
        detail: clean(data.title, 180) || "Acao ecommerce",
        actorId: user.uid,
        actorName: user.name,
        metadata: {
          actionId: ref.id,
          actionType: clean(data.type, 80),
          status,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ ok: true, tenantId, actionId: ref.id, status });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao atualizar acao ecommerce:", error);
    return NextResponse.json({ error: "Falha ao atualizar acao ecommerce." }, { status: 500 });
  }
}
