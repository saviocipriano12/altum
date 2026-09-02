import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { isPlatformPlanId } from "@/lib/platform-plans";
import { listPlatformPlans } from "@/lib/server/platform-plans";

export async function GET(req: Request) {
  try {
    await requireRequestUser(req, { roles: ["agency_owner", "agency_admin"] });
    return NextResponse.json({ plans: await listPlatformPlans() });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: "Falha ao carregar planos." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const actor = await requireRequestUser(req, { roles: ["agency_owner", "agency_admin"] });
    const body = (await req.json()) as { id?: unknown; monthlyPrice?: unknown; active?: unknown; checkoutEnabled?: unknown };
    if (!isPlatformPlanId(body.id)) return NextResponse.json({ error: "Plano invalido." }, { status: 400 });
    const price = body.monthlyPrice === null ? null : Number(body.monthlyPrice);
    if (price !== null && (!Number.isFinite(price) || price <= 0 || price > 100_000)) {
      return NextResponse.json({ error: "Valor mensal invalido." }, { status: 400 });
    }
    await adminDb.collection("platform_plans").doc(body.id).set({
      monthlyPrice: price,
      active: Boolean(body.active),
      checkoutEnabled: price !== null && Boolean(body.checkoutEnabled),
      updatedBy: actor.uid,
      updatedByName: actor.name,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ ok: true, plans: await listPlatformPlans() });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Falha ao atualizar plano:", error);
    return NextResponse.json({ error: "Falha ao atualizar plano." }, { status: 500 });
  }
}
