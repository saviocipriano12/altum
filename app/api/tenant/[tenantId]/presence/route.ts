import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, TenantAccessError } from "@/lib/server/tenant";

type Body = { state?: "online" | "away" | "offline" };

export async function PATCH(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    const body = await req.json().catch(() => ({})) as Body;
    const state = body.state === "away" || body.state === "offline" ? body.state : "online";
    await adminDb.collection("tenant_users").doc(membership.id).set({
      presenceState: state,
      lastSeenAt: FieldValue.serverTimestamp(),
      presenceUpdatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "Falha ao atualizar presença." }, { status: 500 });
  }
}
