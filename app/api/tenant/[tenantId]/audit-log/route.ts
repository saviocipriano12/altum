import { NextResponse } from "next/server";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";

export async function GET(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const actor = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(actor.uid, tenantId);
    assertTenantCapability(membership, "manage_users");
    const snap = await adminDb.collection("audit_logs").where("tenantId", "==", tenantId).limit(200).get();
    const items = snap.docs.map((doc): Record<string, unknown> & { id: string } => ({ id: doc.id, ...doc.data() })).sort((a, b) => {
      const left = (a.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
      const right = (b.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() || 0;
      return right - left;
    }).slice(0, 80);
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    return NextResponse.json({ error: "Não foi possível carregar o histórico." }, { status: 500 });
  }
}
