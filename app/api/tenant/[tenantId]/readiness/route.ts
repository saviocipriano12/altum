import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { getTenantReadinessSnapshot } from "@/lib/server/tenant-readiness";
import { assertTenantAccess, assertTenantCapability, assertTenantRole, TenantAccessError } from "@/lib/server/tenant";

const GO_LIVE_CHECKLIST_VERSION = "2026-04-definitive";

export async function GET(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantRole(membership, "client_viewer");

    const snapshot = await getTenantReadinessSnapshot(tenantId);
    return NextResponse.json({ ok: true, ...snapshot });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao carregar prontidao do tenant:", error);
    return NextResponse.json({ error: "Falha ao carregar prontidao do tenant." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ tenantId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");

    const snapshot = await getTenantReadinessSnapshot(tenantId);
    const approved = snapshot.activation.readyForSale;

    await adminDb.collection("tenant_settings").doc(tenantId).set(
      {
        tenantId,
        goLive: {
          status: approved ? "approved" : "blocked",
          checkedAt: FieldValue.serverTimestamp(),
          checkedBy: user.uid,
          checkedByName: user.name,
          approvedAt: approved ? FieldValue.serverTimestamp() : null,
          approvedBy: approved ? user.uid : null,
          approvedByName: approved ? user.name : null,
          blockerIds: snapshot.checklist.filter((item) => item.critical && item.blocking).map((item) => item.id),
          score: snapshot.summary.readinessScore,
          checklistVersion: GO_LIVE_CHECKLIST_VERSION,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: user.name,
      },
      { merge: true }
    );

    const refreshed = await getTenantReadinessSnapshot(tenantId);

    if (!approved) {
      return NextResponse.json(
        {
          ok: false,
          message: "Go-live bloqueado. Resolva os itens criticos antes de liberar o tenant.",
          ...refreshed,
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Go-live validado com sucesso para este tenant.",
      ...refreshed,
    });
  } catch (error) {
    if (error instanceof RouteAuthError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    if (error instanceof TenantAccessError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    }
    console.error("Erro ao validar go-live do tenant:", error);
    return NextResponse.json({ error: "Falha ao validar go-live do tenant." }, { status: 500 });
  }
}
