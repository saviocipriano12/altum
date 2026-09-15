import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";

export const dynamic = "force-dynamic";

function clean(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tenantId: string; draftId: string }> }
) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId, draftId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");
    const safeDraftId = clean(draftId, 180);
    if (!/^[A-Za-z0-9_-]{1,180}$/.test(safeDraftId)) {
      return NextResponse.json({ error: "Rascunho invalido." }, { status: 400 });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action, 40);
    const status = action === "approve" ? "approved_pending_apply" : action === "reject" ? "rejected" : "pending_review";
    if (status === "pending_review") return NextResponse.json({ error: "Acao invalida." }, { status: 400 });

    const ref = adminDb.collection("mcp_action_drafts").doc(safeDraftId);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: "Rascunho nao encontrado." }, { status: 404 });
    const data = snap.data() as Record<string, unknown>;
    if (data.tenantId !== tenantId) return NextResponse.json({ error: "Sem permissao para este rascunho." }, { status: 403 });

    await Promise.all([
      ref.set({
        status,
        reviewNotes: clean(body.notes, 800),
        reviewedAt: FieldValue.serverTimestamp(),
        reviewedBy: user.uid,
        reviewedByName: user.name,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true }),
      adminDb.collection("audit_logs").add({
        type: "mcp_action_draft_review",
        actorId: user.uid,
        actorName: user.name,
        tenantId,
        draftId: safeDraftId,
        status,
        createdAt: FieldValue.serverTimestamp(),
      }),
    ]);

    return NextResponse.json({ ok: true, tenantId, draftId: safeDraftId, status }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao revisar rascunho MCP:", error);
    return NextResponse.json({ error: "Falha ao revisar rascunho MCP." }, { status: 500 });
  }
}