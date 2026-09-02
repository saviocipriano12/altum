import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/app/lib/server/firebase-admin";
import { requireRequestUser, RouteAuthError } from "@/app/lib/server/route-auth";
import { assertTenantAccess, assertTenantCapability, TenantAccessError } from "@/lib/server/tenant";
import { generateBusinessBlueprint, type BusinessBlueprintInput } from "@/lib/business-blueprint";
import { applyBusinessBlueprint } from "@/lib/server/business-blueprint-provisioning";
import { interpretBusinessBrief, interpretBusinessBriefWithRules } from "@/lib/server/business-blueprint-ai";

type Body = { action?: "interpret" | "preview" | "apply"; data?: BusinessBlueprintInput; brief?: string; current?: unknown };

export async function POST(req: Request, context: { params: Promise<{ tenantId: string }> }) {
  try {
    const user = await requireRequestUser(req);
    const { tenantId } = await context.params;
    const membership = await assertTenantAccess(user.uid, tenantId);
    assertTenantCapability(membership, "manage_settings");
    const body = (await req.json().catch(() => ({}))) as Body;
    if (body.action === "interpret") {
      const brief = String(body.brief || "").trim().slice(0, 8000);
      if (brief.length < 30) return NextResponse.json({ error: "Conte um pouco mais sobre como a empresa funciona e vende." }, { status: 400 });
      try {
        const interpreted = await interpretBusinessBrief({ brief, current: body.current });
        return NextResponse.json({ ok: true, tenantId, interpreted: interpreted.result, model: interpreted.model });
      } catch (aiError) {
        console.warn("Blueprint AI indisponível; usando interpretação local segura.", { tenantId, error: aiError instanceof Error ? aiError.message : "unknown" });
        return NextResponse.json({ ok: true, tenantId, interpreted: interpretBusinessBriefWithRules({ brief, current: body.current }), model: "altum_rules", warning: "A IA externa está indisponível. A Altum criou uma estrutura inicial local para revisão." });
      }
    }
    if (!body.data?.company?.name || !body.data.company.segment || !body.data.offer?.summary || !body.data.sales?.salesMotion) {
      return NextResponse.json({ error: "Complete empresa, segmento, oferta e forma de fechamento antes de gerar o Blueprint." }, { status: 400 });
    }
    const blueprint = generateBusinessBlueprint(body.data);
    await adminDb.collection("tenant_settings").doc(tenantId).set({
      businessBlueprint: { draft: blueprint, draftFingerprint: blueprint.fingerprint, generatedAt: FieldValue.serverTimestamp(), generatedBy: user.uid },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (body.action !== "apply") return NextResponse.json({ ok: true, tenantId, blueprint });

    const applied = await applyBusinessBlueprint({ tenantId, blueprint, actorId: user.uid, actorName: user.name });
    await adminDb.collection("tenant_settings").doc(tenantId).set({
      onboarding: { product: { status: "ready", preparedAt: FieldValue.serverTimestamp(), preparedBy: user.uid, preparedByName: user.name } },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ ok: true, tenantId, blueprint, applied });
  } catch (error) {
    if (error instanceof RouteAuthError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    if (error instanceof TenantAccessError) return NextResponse.json({ error: error.message, code: error.code }, { status: 403 });
    console.error("Erro ao gerar Business Blueprint:", error);
    return NextResponse.json({ error: "Falha ao gerar o Blueprint da empresa." }, { status: 500 });
  }
}
