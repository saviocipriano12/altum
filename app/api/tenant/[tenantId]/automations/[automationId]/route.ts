import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { normalizeAutomationDoc } from "@/lib/server/automations";
import { assertTenantModule } from "@/lib/server/tenant-entitlements";

type Body = Record<string, unknown>;

async function getAutomationRef(tenantId: string, automationId: string) {
  const ref = adminDb.collection("automations").doc(automationId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new RouteAuthError(404, "automation_not_found", "Automacao nao encontrada.");
  }

  const data = snap.data() as Record<string, unknown>;
  if (String(data.tenantId || "") !== tenantId) {
    throw new RouteAuthError(403, "forbidden_tenant", "Automacao fora do tenant informado.");
  }

  return { ref, data };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; automationId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, automationId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "automation");
    assertTenantCapability(membership, "manage_automations");

    const { ref, data } = await getAutomationRef(tenantId, automationId);
    const body = (await req.json()) as Body;
    const normalized = normalizeAutomationDoc(
      automationId,
      {
        ...data,
        ...body,
        tenantId,
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      tenantId
    );

    if (!normalized.name || normalized.actions.length === 0) {
      return NextResponse.json({ error: "Automacao invalida. Defina nome e pelo menos uma acao." }, { status: 400 });
    }

    await ref.set(
      {
        tenantId,
        name: normalized.name,
        description: normalized.description,
        trigger: normalized.trigger,
        enabled: normalized.enabled,
        status: normalized.status,
        conditions: normalized.conditions,
        actions: normalized.actions,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, tenantId, automationId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao atualizar automacao do tenant:", error);
    return NextResponse.json({ error: "Falha ao atualizar automacao." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string; automationId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, automationId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    await assertTenantModule(tenantId, "automation");
    assertTenantCapability(membership, "manage_automations");

    const { ref } = await getAutomationRef(tenantId, automationId);
    await ref.delete();

    return NextResponse.json({ ok: true, tenantId, automationId });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao remover automacao do tenant:", error);
    return NextResponse.json({ error: "Falha ao remover automacao." }, { status: 500 });
  }
}
