import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import {
  buildConnectionPayload,
  buildEcommerceWebhookSecret,
  publicConnectionFromDoc,
  type EcommerceConnectionInput,
} from "@/lib/server/ecommerce";

function clean(value: unknown, max = 300) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

async function readConnection(tenantId: string, connectionId: string) {
  const ref = adminDb.collection("ecommerce_connections").doc(clean(connectionId, 180));
  const snap = await ref.get();
  if (!snap.exists) return { ref, snap, data: null };
  const data = snap.data() as Record<string, unknown>;
  if (clean(data.tenantId, 180) !== tenantId) throw new TenantAccessError("tenant_mismatch", "Integracao nao pertence a este tenant.");
  return { ref, snap, data };
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; connectionId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, connectionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const { ref, snap, data } = await readConnection(tenantId, connectionId);
    if (!data) return NextResponse.json({ error: "Integracao nao encontrada." }, { status: 404 });

    const body = (await req.json()) as EcommerceConnectionInput & { rotateWebhookSecret?: boolean };
    const webhookSecret = body.rotateWebhookSecret ? buildEcommerceWebhookSecret() : "";
    const payload = buildConnectionPayload({
      ...data,
      ...body,
      provider: data.provider,
      tenantId,
      userId: user.uid,
      userName: user.name,
      webhookSecret,
    });

    await ref.set(payload, { merge: true });
    const nextSnap = await ref.get();
    return NextResponse.json({
      ok: true,
      tenantId,
      connection: publicConnectionFromDoc(nextSnap),
      ...(webhookSecret ? { webhookSecret } : {}),
      previousUpdatedAt: snap.updateTime?.toDate().toISOString() || null,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao atualizar integracao ecommerce:", error);
    return NextResponse.json({ error: "Falha ao atualizar integracao ecommerce." }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: { params: Promise<{ tenantId: string; connectionId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, connectionId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_channels");

    const { ref, data } = await readConnection(tenantId, connectionId);
    if (!data) return NextResponse.json({ error: "Integracao nao encontrada." }, { status: 404 });
    await ref.set(
      {
        status: "paused",
        connectionStatus: "paused",
        disconnectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, tenantId, connectionId, status: "paused" });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao pausar integracao ecommerce:", error);
    return NextResponse.json({ error: "Falha ao pausar integracao ecommerce." }, { status: 500 });
  }
}

